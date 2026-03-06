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

    CREATE INDEX IF NOT EXISTS idx_trades_asset_time ON trades(asset_id, traded_at, id);
    CREATE INDEX IF NOT EXISTS idx_net_worth_entry_type_category ON net_worth_entries(entry_type, category);
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
