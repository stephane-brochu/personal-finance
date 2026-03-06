import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

type GlobalWithDb = typeof globalThis & {
  __portfolioDb?: Database.Database;
};

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "portfolio.db");

function ensureDbDirectory() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

function runMigrations(db: Database.Database) {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      asset_type TEXT NOT NULL CHECK (asset_type IN ('equity', 'crypto')),
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(symbol, asset_type)
    );

    CREATE TABLE IF NOT EXISTS portfolios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL DEFAULT 1,
      asset_id INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      traded_at TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      import_fingerprint TEXT,
      FOREIGN KEY(portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS quote_cache (
      asset_id INTEGER PRIMARY KEY,
      price REAL NOT NULL,
      quoted_at TEXT NOT NULL,
      source TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS net_worth_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('asset', 'debt')),
      category TEXT NOT NULL CHECK (category IN ('house', 'car', 'jewelry', 'cash', 'mortgage', 'car_lease')),
      label TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(entry_type, category, label)
    );

    CREATE TABLE IF NOT EXISTS portfolio_cash_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      portfolio_id INTEGER NOT NULL DEFAULT 1,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')),
      amount REAL NOT NULL,
      occurred_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      fingerprint TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS broker_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK (provider IN ('questrade')),
      broker_account_number TEXT NOT NULL,
      portfolio_id INTEGER NOT NULL,
      last_synced_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'never' CHECK (sync_status IN ('never', 'ok', 'partial', 'failed')),
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE,
      UNIQUE(provider, broker_account_number)
    );

    CREATE INDEX IF NOT EXISTS idx_net_worth_entry_type_category ON net_worth_entries(entry_type, category);
  `);

  db.exec("INSERT OR IGNORE INTO portfolios (id, name) VALUES (1, 'Default')");

  const tradeColumns = db
    .prepare("PRAGMA table_info(trades)")
    .all() as Array<{ name: string }>;
  const hasImportFingerprint = tradeColumns.some(
    (column) => column.name === "import_fingerprint",
  );

  if (!hasImportFingerprint) {
    db.exec("ALTER TABLE trades ADD COLUMN import_fingerprint TEXT");
  }

  const hasTradePortfolioId = tradeColumns.some(
    (column) => column.name === "portfolio_id",
  );
  if (!hasTradePortfolioId) {
    db.exec("ALTER TABLE trades ADD COLUMN portfolio_id INTEGER NOT NULL DEFAULT 1");
  }

  const hasTradeSource = tradeColumns.some((column) => column.name === "source");
  if (!hasTradeSource) {
    db.exec("ALTER TABLE trades ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  }

  const cashColumns = db
    .prepare("PRAGMA table_info(portfolio_cash_transactions)")
    .all() as Array<{ name: string }>;
  const hasCashPortfolioId = cashColumns.some(
    (column) => column.name === "portfolio_id",
  );
  if (!hasCashPortfolioId) {
    db.exec(
      "ALTER TABLE portfolio_cash_transactions ADD COLUMN portfolio_id INTEGER NOT NULL DEFAULT 1",
    );
  }

  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_portfolio_import_fingerprint ON trades(portfolio_id, import_fingerprint) WHERE import_fingerprint IS NOT NULL",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_trades_portfolio_asset_time ON trades(portfolio_id, asset_id, traded_at, id)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_cash_transactions_portfolio_time ON portfolio_cash_transactions(portfolio_id, occurred_at, id)",
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_portfolio_fingerprint ON portfolio_cash_transactions(portfolio_id, fingerprint)",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_broker_accounts_provider_portfolio ON broker_accounts(provider, portfolio_id)",
  );
}

export function getDb() {
  const globalWithDb = globalThis as GlobalWithDb;
  if (!globalWithDb.__portfolioDb) {
    ensureDbDirectory();
    const db = new Database(DB_PATH);
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    globalWithDb.__portfolioDb = db;
  }

  return globalWithDb.__portfolioDb;
}
