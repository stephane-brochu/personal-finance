import { getDb } from "@/lib/db";
import { isCategoryValidForEntryType } from "@/lib/net-worth";
import { calculatePositionFromTrades, normalizeSymbol } from "@/lib/portfolio";
import type {
  Asset,
  AssetType,
  NetWorthCategory,
  NetWorthEntry,
  NetWorthEntryType,
  Trade,
  TradeSide,
} from "@/lib/types";

type AssetRow = {
  id: number;
  symbol: string;
  asset_type: AssetType;
  name: string | null;
  created_at: string;
  updated_at: string;
};

type TradeRow = {
  id: number;
  asset_id: number;
  symbol: string;
  asset_type: AssetType;
  side: TradeSide;
  quantity: number;
  price: number;
  fee: number;
  traded_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type QuoteCacheRow = {
  asset_id: number;
  price: number;
  quoted_at: string;
  source: string;
  updated_at: string;
};

type NetWorthEntryRow = {
  id: number;
  entry_type: NetWorthEntryType;
  category: NetWorthCategory;
  label: string;
  amount: number;
  created_at: string;
  updated_at: string;
};

function mapAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    symbol: row.symbol,
    assetType: row.asset_type,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    assetId: row.asset_id,
    symbol: row.symbol,
    assetType: row.asset_type,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    tradedAt: row.traded_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNetWorthEntry(row: NetWorthEntryRow): NetWorthEntry {
  return {
    id: row.id,
    entryType: row.entry_type,
    category: row.category,
    label: row.label,
    amount: row.amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getAssets() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM assets ORDER BY symbol ASC")
    .all() as AssetRow[];

  return rows.map(mapAsset);
}

export function getAssetById(assetId: number) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM assets WHERE id = ?").get(assetId) as
    | AssetRow
    | undefined;

  return row ? mapAsset(row) : null;
}

export function getOrCreateAsset(input: {
  symbol: string;
  assetType: AssetType;
  name?: string | null;
}) {
  const db = getDb();
  const symbol = normalizeSymbol(input.symbol);

  const existing = db
    .prepare("SELECT * FROM assets WHERE symbol = ? AND asset_type = ?")
    .get(symbol, input.assetType) as AssetRow | undefined;

  if (existing) {
    if (input.name && !existing.name) {
      db.prepare(
        "UPDATE assets SET name = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(input.name, existing.id);
      return {
        ...mapAsset(existing),
        name: input.name,
      };
    }

    return mapAsset(existing);
  }

  const insert = db.prepare(
    "INSERT INTO assets (symbol, asset_type, name) VALUES (?, ?, ?)",
  );
  const result = insert.run(symbol, input.assetType, input.name ?? null);

  return getAssetById(Number(result.lastInsertRowid));
}

export function listTrades() {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        t.id,
        t.asset_id,
        a.symbol,
        a.asset_type,
        t.side,
        t.quantity,
        t.price,
        t.fee,
        t.traded_at,
        t.notes,
        t.created_at,
        t.updated_at
      FROM trades t
      JOIN assets a ON a.id = t.asset_id
      ORDER BY t.traded_at DESC, t.id DESC
    `,
    )
    .all() as TradeRow[];

  return rows.map(mapTrade);
}

export function listTradesByAsset(assetId: number) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        t.id,
        t.asset_id,
        a.symbol,
        a.asset_type,
        t.side,
        t.quantity,
        t.price,
        t.fee,
        t.traded_at,
        t.notes,
        t.created_at,
        t.updated_at
      FROM trades t
      JOIN assets a ON a.id = t.asset_id
      WHERE t.asset_id = ?
      ORDER BY t.traded_at ASC, t.id ASC
    `,
    )
    .all(assetId) as TradeRow[];

  return rows.map(mapTrade);
}

export function getTradeById(id: number) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT
        t.id,
        t.asset_id,
        a.symbol,
        a.asset_type,
        t.side,
        t.quantity,
        t.price,
        t.fee,
        t.traded_at,
        t.notes,
        t.created_at,
        t.updated_at
      FROM trades t
      JOIN assets a ON a.id = t.asset_id
      WHERE t.id = ?
    `,
    )
    .get(id) as TradeRow | undefined;

  return row ? mapTrade(row) : null;
}

function assertNonNegativeInventory(trades: Trade[]) {
  calculatePositionFromTrades(
    trades.map((trade) => ({
      id: trade.id,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      fee: trade.fee,
      tradedAt: trade.tradedAt,
    })),
  );
}

export function createTrade(input: {
  symbol: string;
  assetType: AssetType;
  side: TradeSide;
  quantity: number;
  price: number;
  fee: number;
  tradedAt: string;
  notes?: string | null;
  name?: string | null;
}) {
  const db = getDb();
  const asset = getOrCreateAsset({
    symbol: input.symbol,
    assetType: input.assetType,
    name: input.name,
  });

  if (!asset) {
    throw new Error("Unable to create asset");
  }

  const existingTrades = listTradesByAsset(asset.id);
  const candidateTrade: Trade = {
    id: Number.MAX_SAFE_INTEGER,
    assetId: asset.id,
    symbol: asset.symbol,
    assetType: asset.assetType,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    fee: input.fee,
    tradedAt: input.tradedAt,
    notes: input.notes ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  assertNonNegativeInventory([...existingTrades, candidateTrade]);

  const insert = db.prepare(
    `
      INSERT INTO trades (asset_id, side, quantity, price, fee, traded_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  );

  const result = insert.run(
    asset.id,
    input.side,
    input.quantity,
    input.price,
    input.fee,
    input.tradedAt,
    input.notes ?? null,
  );

  return getTradeById(Number(result.lastInsertRowid));
}

export function updateTrade(
  tradeId: number,
  input: {
    side: TradeSide;
    quantity: number;
    price: number;
    fee: number;
    tradedAt: string;
    notes?: string | null;
  },
) {
  const db = getDb();
  const existingTrade = getTradeById(tradeId);

  if (!existingTrade) {
    return null;
  }

  const existingTrades = listTradesByAsset(existingTrade.assetId);
  const candidateTrades = existingTrades.map((trade) =>
    trade.id === tradeId
      ? {
          ...trade,
          ...input,
          notes: input.notes ?? null,
        }
      : trade,
  );

  assertNonNegativeInventory(candidateTrades);

  db.prepare(
    `
    UPDATE trades
    SET side = ?, quantity = ?, price = ?, fee = ?, traded_at = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `,
  ).run(
    input.side,
    input.quantity,
    input.price,
    input.fee,
    input.tradedAt,
    input.notes ?? null,
    tradeId,
  );

  return getTradeById(tradeId);
}

export function deleteTrade(tradeId: number) {
  const db = getDb();
  const existingTrade = getTradeById(tradeId);

  if (!existingTrade) {
    return false;
  }

  const remainingTrades = listTradesByAsset(existingTrade.assetId).filter(
    (trade) => trade.id !== tradeId,
  );

  assertNonNegativeInventory(remainingTrades);

  const result = db.prepare("DELETE FROM trades WHERE id = ?").run(tradeId);
  return result.changes > 0;
}

export function getQuoteCacheByAssetIds(assetIds: number[]) {
  if (assetIds.length === 0) {
    return new Map<number, QuoteCacheRow>();
  }

  const db = getDb();
  const placeholders = assetIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT * FROM quote_cache WHERE asset_id IN (${placeholders}) ORDER BY asset_id ASC`,
    )
    .all(...assetIds) as QuoteCacheRow[];

  return new Map(rows.map((row) => [row.asset_id, row]));
}

export function upsertQuoteCache(input: {
  assetId: number;
  price: number;
  quotedAt: string;
  source: string;
}) {
  const db = getDb();
  db.prepare(
    `
      INSERT INTO quote_cache (asset_id, price, quoted_at, source, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(asset_id) DO UPDATE SET
        price = excluded.price,
        quoted_at = excluded.quoted_at,
        source = excluded.source,
        updated_at = datetime('now')
    `,
  ).run(input.assetId, input.price, input.quotedAt, input.source);
}

export function listNetWorthEntries() {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT id, entry_type, category, label, amount, created_at, updated_at
      FROM net_worth_entries
      ORDER BY entry_type ASC, category ASC, label ASC, id ASC
      `,
    )
    .all() as NetWorthEntryRow[];

  return rows.map(mapNetWorthEntry);
}

export function getNetWorthEntryById(entryId: number) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT id, entry_type, category, label, amount, created_at, updated_at
      FROM net_worth_entries
      WHERE id = ?
      `,
    )
    .get(entryId) as NetWorthEntryRow | undefined;

  return row ? mapNetWorthEntry(row) : null;
}

export function createNetWorthEntry(input: {
  entryType: NetWorthEntryType;
  category: NetWorthCategory;
  label: string;
  amount: number;
}) {
  if (!isCategoryValidForEntryType(input.entryType, input.category)) {
    throw new Error("Category is not valid for entry type");
  }

  const db = getDb();
  const result = db
    .prepare(
      `
      INSERT INTO net_worth_entries (entry_type, category, label, amount)
      VALUES (?, ?, ?, ?)
      `,
    )
    .run(input.entryType, input.category, input.label.trim(), input.amount);

  return getNetWorthEntryById(Number(result.lastInsertRowid));
}

export function updateNetWorthEntry(
  entryId: number,
  input: {
    label: string;
    amount: number;
  },
) {
  const db = getDb();
  const existing = getNetWorthEntryById(entryId);

  if (!existing) {
    return null;
  }

  db.prepare(
    `
    UPDATE net_worth_entries
    SET label = ?, amount = ?, updated_at = datetime('now')
    WHERE id = ?
    `,
  ).run(input.label.trim(), input.amount, entryId);

  return getNetWorthEntryById(entryId);
}
