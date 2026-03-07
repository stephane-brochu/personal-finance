import { getDb } from "@/lib/db";
import { isCategoryValidForEntryType } from "@/lib/net-worth";
import { calculatePositionFromTrades, normalizeSymbol } from "@/lib/portfolio";
import type {
  Asset,
  AssetType,
  BrokerAccount,
  BrokerProvider,
  BrokerSyncStatus,
  CashTransaction,
  CashTransactionType,
  NetWorthCategory,
  NetWorthEntry,
  NetWorthEntryType,
  Portfolio,
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

type PortfolioRow = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

type TradeRow = {
  id: number;
  portfolio_id: number;
  asset_id: number;
  symbol: string;
  asset_type: AssetType;
  source: string;
  side: TradeSide;
  quantity: number;
  price: number;
  fee: number;
  traded_at: string;
  notes: string | null;
  import_fingerprint: string | null;
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

type CashTransactionRow = {
  id: number;
  portfolio_id: number;
  transaction_type: CashTransactionType;
  amount: number;
  occurred_at: string;
  source: string;
  fingerprint: string;
  created_at: string;
  updated_at: string;
};

type BrokerAccountRow = {
  id: number;
  provider: BrokerProvider;
  broker_account_number: string;
  portfolio_id: number;
  last_synced_at: string | null;
  sync_status: BrokerSyncStatus;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function mapPortfolio(row: PortfolioRow): Portfolio {
  return {
    id: row.id,
    name: row.name,
    brokerProvider: null,
    brokerAccountNumber: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
    portfolioId: row.portfolio_id,
    assetId: row.asset_id,
    symbol: row.symbol,
    assetType: row.asset_type,
    source: row.source,
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

function mapCashTransaction(row: CashTransactionRow): CashTransaction {
  return {
    id: row.id,
    portfolioId: row.portfolio_id,
    transactionType: row.transaction_type,
    amount: row.amount,
    occurredAt: row.occurred_at,
    source: row.source,
    fingerprint: row.fingerprint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapBrokerAccount(row: BrokerAccountRow): BrokerAccount {
  return {
    id: row.id,
    provider: row.provider,
    brokerAccountNumber: row.broker_account_number,
    portfolioId: row.portfolio_id,
    lastSyncedAt: row.last_synced_at,
    syncStatus: row.sync_status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listPortfolios() {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM portfolios ORDER BY created_at ASC, id ASC")
    .all() as PortfolioRow[];

  return rows.map(mapPortfolio);
}

export function listPortfoliosByBrokerProvider(provider: BrokerProvider) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        p.id,
        p.name,
        p.created_at,
        p.updated_at,
        b.provider AS broker_provider,
        b.broker_account_number
      FROM portfolios p
      JOIN broker_accounts b ON b.portfolio_id = p.id
      WHERE b.provider = ?
      ORDER BY b.broker_account_number ASC, p.name ASC, p.id ASC
      `,
    )
    .all(provider) as Array<
    PortfolioRow & { broker_provider: BrokerProvider; broker_account_number: string }
  >;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    brokerProvider: row.broker_provider,
    brokerAccountNumber: row.broker_account_number,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function getPortfolioById(portfolioId: number) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM portfolios WHERE id = ?")
    .get(portfolioId) as PortfolioRow | undefined;

  return row ? mapPortfolio(row) : null;
}

export function getPortfolioByName(name: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM portfolios WHERE name = ?")
    .get(name.trim()) as PortfolioRow | undefined;

  return row ? mapPortfolio(row) : null;
}

export function createPortfolio(name: string) {
  const db = getDb();
  const trimmed = name.trim();

  const result = db
    .prepare("INSERT INTO portfolios (name) VALUES (?)")
    .run(trimmed);

  return getPortfolioById(Number(result.lastInsertRowid));
}

export function getOrCreatePortfolioByName(name: string) {
  const trimmed = name.trim();
  const existing = getPortfolioByName(trimmed);
  if (existing) {
    return existing;
  }

  return createPortfolio(trimmed);
}

export function getAssets(portfolioId: number) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT DISTINCT a.*
      FROM assets a
      JOIN trades t ON t.asset_id = a.id
      WHERE t.portfolio_id = ?
      ORDER BY a.symbol ASC
      `,
    )
    .all(portfolioId) as AssetRow[];

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

  const result = db
    .prepare("INSERT INTO assets (symbol, asset_type, name) VALUES (?, ?, ?)")
    .run(symbol, input.assetType, input.name ?? null);

  return getAssetById(Number(result.lastInsertRowid));
}

export function listTrades(portfolioId: number) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        t.id,
        t.portfolio_id,
        t.asset_id,
        a.symbol,
        a.asset_type,
        t.source,
        t.side,
        t.quantity,
        t.price,
        t.fee,
        t.traded_at,
        t.notes,
        t.import_fingerprint,
        t.created_at,
        t.updated_at
      FROM trades t
      JOIN assets a ON a.id = t.asset_id
      WHERE t.portfolio_id = ?
      ORDER BY t.traded_at DESC, t.id DESC
      `,
    )
    .all(portfolioId) as TradeRow[];

  return rows.map(mapTrade);
}

export function listTradesByAsset(portfolioId: number, assetId: number) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        t.id,
        t.portfolio_id,
        t.asset_id,
        a.symbol,
        a.asset_type,
        t.source,
        t.side,
        t.quantity,
        t.price,
        t.fee,
        t.traded_at,
        t.notes,
        t.import_fingerprint,
        t.created_at,
        t.updated_at
      FROM trades t
      JOIN assets a ON a.id = t.asset_id
      WHERE t.portfolio_id = ?
        AND t.asset_id = ?
      ORDER BY t.traded_at ASC, t.id ASC
      `,
    )
    .all(portfolioId, assetId) as TradeRow[];

  return rows.map(mapTrade);
}

export function getTradeById(tradeId: number, portfolioId: number) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT
        t.id,
        t.portfolio_id,
        t.asset_id,
        a.symbol,
        a.asset_type,
        t.source,
        t.side,
        t.quantity,
        t.price,
        t.fee,
        t.traded_at,
        t.notes,
        t.import_fingerprint,
        t.created_at,
        t.updated_at
      FROM trades t
      JOIN assets a ON a.id = t.asset_id
      WHERE t.id = ?
        AND t.portfolio_id = ?
      `,
    )
    .get(tradeId, portfolioId) as TradeRow | undefined;

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
  portfolioId: number;
  symbol: string;
  assetType: AssetType;
  source?: string;
  side: TradeSide;
  quantity: number;
  price: number;
  fee: number;
  tradedAt: string;
  notes?: string | null;
  name?: string | null;
  importFingerprint?: string | null;
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

  const existingTrades = listTradesByAsset(input.portfolioId, asset.id);
  const candidateTrade: Trade = {
    id: Number.MAX_SAFE_INTEGER,
    portfolioId: input.portfolioId,
    assetId: asset.id,
    symbol: asset.symbol,
    assetType: asset.assetType,
    source: input.source ?? "manual",
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

  const result = db
    .prepare(
      `
      INSERT INTO trades (
        portfolio_id,
        asset_id,
        source,
        side,
        quantity,
        price,
        fee,
        traded_at,
        notes,
        import_fingerprint
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.portfolioId,
      asset.id,
      input.source ?? "manual",
      input.side,
      input.quantity,
      input.price,
      input.fee,
      input.tradedAt,
      input.notes ?? null,
      input.importFingerprint ?? null,
    );

  return getTradeById(Number(result.lastInsertRowid), input.portfolioId);
}

export function getTradeByImportFingerprint(portfolioId: number, importFingerprint: string) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT
        t.id,
        t.portfolio_id,
        t.asset_id,
        a.symbol,
        a.asset_type,
        t.source,
        t.side,
        t.quantity,
        t.price,
        t.fee,
        t.traded_at,
        t.notes,
        t.import_fingerprint,
        t.created_at,
        t.updated_at
      FROM trades t
      JOIN assets a ON a.id = t.asset_id
      WHERE t.portfolio_id = ?
        AND t.import_fingerprint = ?
      `,
    )
    .get(portfolioId, importFingerprint) as TradeRow | undefined;

  return row ? mapTrade(row) : null;
}

export function updateTrade(
  tradeId: number,
  portfolioId: number,
  input: {
    source?: string;
    side: TradeSide;
    quantity: number;
    price: number;
    fee: number;
    tradedAt: string;
    notes?: string | null;
  },
) {
  const db = getDb();
  const existingTrade = getTradeById(tradeId, portfolioId);

  if (!existingTrade) {
    return null;
  }

  const existingTrades = listTradesByAsset(portfolioId, existingTrade.assetId);
  const candidateTrades = existingTrades.map((trade) =>
    trade.id === tradeId
      ? {
          ...trade,
          ...input,
          source: input.source ?? trade.source,
          notes: input.notes ?? null,
        }
      : trade,
  );

  assertNonNegativeInventory(candidateTrades);

  db.prepare(
    `
    UPDATE trades
    SET source = ?, side = ?, quantity = ?, price = ?, fee = ?, traded_at = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
      AND portfolio_id = ?
    `,
  ).run(
    input.source ?? existingTrade.source,
    input.side,
    input.quantity,
    input.price,
    input.fee,
    input.tradedAt,
    input.notes ?? null,
    tradeId,
    portfolioId,
  );

  return getTradeById(tradeId, portfolioId);
}

export function deleteTrade(tradeId: number, portfolioId: number) {
  const db = getDb();
  const existingTrade = getTradeById(tradeId, portfolioId);

  if (!existingTrade) {
    return false;
  }

  const remainingTrades = listTradesByAsset(portfolioId, existingTrade.assetId).filter(
    (trade) => trade.id !== tradeId,
  );

  assertNonNegativeInventory(remainingTrades);

  const result = db
    .prepare("DELETE FROM trades WHERE id = ? AND portfolio_id = ?")
    .run(tradeId, portfolioId);

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

export function listCashTransactions(portfolioId: number) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT *
      FROM portfolio_cash_transactions
      WHERE portfolio_id = ?
      ORDER BY occurred_at DESC, id DESC
      `,
    )
    .all(portfolioId) as CashTransactionRow[];

  return rows.map(mapCashTransaction);
}

export function getCashTransactionByFingerprint(portfolioId: number, fingerprint: string) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT *
      FROM portfolio_cash_transactions
      WHERE portfolio_id = ?
        AND fingerprint = ?
      `,
    )
    .get(portfolioId, fingerprint) as CashTransactionRow | undefined;

  return row ? mapCashTransaction(row) : null;
}

export function createCashTransaction(input: {
  portfolioId: number;
  transactionType: CashTransactionType;
  amount: number;
  occurredAt: string;
  source: string;
  fingerprint: string;
}) {
  const db = getDb();
  const result = db
    .prepare(
      `
      INSERT INTO portfolio_cash_transactions (
        portfolio_id,
        transaction_type,
        amount,
        occurred_at,
        source,
        fingerprint
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.portfolioId,
      input.transactionType,
      input.amount,
      input.occurredAt,
      input.source,
      input.fingerprint,
    );

  const row = db
    .prepare("SELECT * FROM portfolio_cash_transactions WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as CashTransactionRow;

  return mapCashTransaction(row);
}

export function getBrokerAccount(provider: BrokerProvider, brokerAccountNumber: string) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT *
      FROM broker_accounts
      WHERE provider = ?
        AND broker_account_number = ?
      `,
    )
    .get(provider, brokerAccountNumber) as BrokerAccountRow | undefined;

  return row ? mapBrokerAccount(row) : null;
}

export function listBrokerAccounts(provider?: BrokerProvider) {
  const db = getDb();
  const rows = (provider
    ? db
        .prepare(
          `
          SELECT *
          FROM broker_accounts
          WHERE provider = ?
          ORDER BY created_at ASC, id ASC
          `,
        )
        .all(provider)
    : db
        .prepare(
          `
          SELECT *
          FROM broker_accounts
          ORDER BY created_at ASC, id ASC
          `,
        )
        .all()) as BrokerAccountRow[];

  return rows.map(mapBrokerAccount);
}

export function upsertBrokerAccount(input: {
  provider: BrokerProvider;
  brokerAccountNumber: string;
  portfolioId: number;
}) {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO broker_accounts (provider, broker_account_number, portfolio_id)
    VALUES (?, ?, ?)
    ON CONFLICT(provider, broker_account_number) DO UPDATE SET
      portfolio_id = excluded.portfolio_id,
      updated_at = datetime('now')
    `,
  ).run(input.provider, input.brokerAccountNumber, input.portfolioId);

  return getBrokerAccount(input.provider, input.brokerAccountNumber);
}

export function setBrokerAccountSyncStatus(input: {
  provider: BrokerProvider;
  brokerAccountNumber: string;
  syncStatus: BrokerSyncStatus;
  lastError: string | null;
  touchedAt: string;
}) {
  const db = getDb();
  db.prepare(
    `
    UPDATE broker_accounts
    SET last_synced_at = ?,
        sync_status = ?,
        last_error = ?,
        updated_at = datetime('now')
    WHERE provider = ?
      AND broker_account_number = ?
    `,
  ).run(
    input.touchedAt,
    input.syncStatus,
    input.lastError,
    input.provider,
    input.brokerAccountNumber,
  );
}

export function upsertImportedTradeSnapshot(input: {
  portfolioId: number;
  symbol: string;
  assetType: AssetType;
  source: string;
  side: TradeSide;
  quantity: number;
  price: number;
  fee: number;
  tradedAt: string;
  notes?: string | null;
  importFingerprint: string;
}) {
  const existing = getTradeByImportFingerprint(input.portfolioId, input.importFingerprint);
  if (!existing) {
    createTrade({
      portfolioId: input.portfolioId,
      symbol: input.symbol,
      assetType: input.assetType,
      source: input.source,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      fee: input.fee,
      tradedAt: input.tradedAt,
      notes: input.notes ?? null,
      importFingerprint: input.importFingerprint,
    });
    return "inserted" as const;
  }

  if (
    existing.source === input.source &&
    existing.side === input.side &&
    existing.quantity === input.quantity &&
    existing.price === input.price &&
    existing.fee === input.fee &&
    existing.tradedAt === input.tradedAt &&
    (existing.notes ?? null) === (input.notes ?? null)
  ) {
    return "deduped" as const;
  }

  updateTrade(existing.id, input.portfolioId, {
    source: input.source,
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    fee: input.fee,
    tradedAt: input.tradedAt,
    notes: input.notes ?? null,
  });
  return "inserted" as const;
}

export function upsertImportedCashSnapshot(input: {
  portfolioId: number;
  transactionType: CashTransactionType;
  amount: number;
  occurredAt: string;
  source: string;
  fingerprint: string;
}) {
  const db = getDb();
  const existing = getCashTransactionByFingerprint(input.portfolioId, input.fingerprint);
  if (!existing) {
    createCashTransaction(input);
    return "inserted" as const;
  }

  if (
    existing.transactionType === input.transactionType &&
    existing.amount === input.amount &&
    existing.occurredAt === input.occurredAt &&
    existing.source === input.source
  ) {
    return "deduped" as const;
  }

  db.prepare(
    `
    UPDATE portfolio_cash_transactions
    SET transaction_type = ?,
        amount = ?,
        occurred_at = ?,
        source = ?,
        updated_at = datetime('now')
    WHERE id = ?
      AND portfolio_id = ?
    `,
  ).run(
    input.transactionType,
    input.amount,
    input.occurredAt,
    input.source,
    existing.id,
    input.portfolioId,
  );

  return "inserted" as const;
}
