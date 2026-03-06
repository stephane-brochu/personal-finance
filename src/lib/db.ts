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

    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      fee REAL NOT NULL DEFAULT 0,
      traded_at TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution TEXT NOT NULL,
      account_mask TEXT NOT NULL,
      account_hash TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK (account_type IN ('brokerage', 'bank')),
      currency TEXT NOT NULL DEFAULT 'CAD',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(institution, account_hash, account_type, currency)
    );

    CREATE TABLE IF NOT EXISTS statements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      format TEXT NOT NULL CHECK (format IN ('pdf', 'csv')),
      sha256 TEXT NOT NULL,
      period_start TEXT,
      period_end TEXT,
      parser_id TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
      error_summary TEXT,
      warnings_json TEXT NOT NULL DEFAULT '[]',
      parsed_count INTEGER NOT NULL DEFAULT 0,
      inserted_count INTEGER NOT NULL DEFAULT 0,
      deduped_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      reprocess_of_statement_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY(reprocess_of_statement_id) REFERENCES statements(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS statement_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      record_type TEXT NOT NULL CHECK (record_type IN ('trade', 'cash_movement')),
      fingerprint TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('inserted', 'deduped', 'rejected')),
      source_ref TEXT,
      symbol TEXT,
      side TEXT CHECK (side IN ('buy', 'sell')),
      quantity REAL,
      price REAL,
      fee REAL,
      amount REAL,
      currency TEXT NOT NULL DEFAULT 'CAD',
      occurred_at TEXT NOT NULL,
      description TEXT,
      reference TEXT,
      raw_data_json TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(statement_id) REFERENCES statements(id) ON DELETE CASCADE,
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(statement_id, row_index)
    );

    CREATE TABLE IF NOT EXISTS cash_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      statement_row_id INTEGER NOT NULL,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'dividend', 'interest', 'fee', 'transfer')),
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CAD',
      occurred_at TEXT NOT NULL,
      description TEXT,
      reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      FOREIGN KEY(statement_row_id) REFERENCES statement_rows(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id INTEGER NOT NULL,
      run_type TEXT NOT NULL CHECK (run_type IN ('initial', 'reprocess')),
      status TEXT NOT NULL CHECK (status IN ('completed', 'failed')),
      error_summary TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(statement_id) REFERENCES statements(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_trades_asset_time ON trades(asset_id, traded_at, id);
    CREATE INDEX IF NOT EXISTS idx_net_worth_entry_type_category ON net_worth_entries(entry_type, category);
    CREATE INDEX IF NOT EXISTS idx_accounts_lookup ON accounts(institution, account_hash, account_type, currency);
    CREATE INDEX IF NOT EXISTS idx_statements_account_created ON statements(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_statement_rows_statement ON statement_rows(statement_id, row_index);
    CREATE INDEX IF NOT EXISTS idx_statement_rows_fingerprint ON statement_rows(account_id, fingerprint);
    CREATE INDEX IF NOT EXISTS idx_cash_transactions_account_time ON cash_transactions(account_id, occurred_at, id);
  `);
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
