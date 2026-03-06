import { getDb } from "@/lib/db";
import { normalizeSymbol } from "@/lib/portfolio";
import {
  createTrade,
  getOrCreateAsset,
  getTradeById,
  listTradesByAsset,
} from "@/lib/repository";
import type {
  Account,
  AccountType,
  CashTransaction,
  CashTransactionType,
  NormalizedCashMovementRecord,
  NormalizedTradeRecord,
  Statement,
  StatementIngestCounts,
  StatementIngestStatus,
  StatementRow,
  StatementRowStatus,
} from "@/lib/types";
import { calculatePositionFromTrades } from "@/lib/portfolio";

type AccountRow = {
  id: number;
  institution: string;
  account_mask: string;
  account_hash: string;
  account_type: AccountType;
  currency: string;
  created_at: string;
  updated_at: string;
};

type StatementRowDb = {
  id: number;
  account_id: number;
  institution: string;
  account_mask: string;
  account_type: AccountType;
  currency: string;
  file_name: string;
  file_path: string;
  format: "pdf" | "csv";
  sha256: string;
  period_start: string | null;
  period_end: string | null;
  parser_id: string;
  parser_version: string;
  status: StatementIngestStatus;
  error_summary: string | null;
  warnings_json: string;
  parsed_count: number;
  inserted_count: number;
  deduped_count: number;
  rejected_count: number;
  reprocess_of_statement_id: number | null;
  created_at: string;
  updated_at: string;
};

type StatementDetailRowDb = {
  id: number;
  statement_id: number;
  account_id: number;
  row_index: number;
  record_type: "trade" | "cash_movement";
  fingerprint: string;
  status: StatementRowStatus;
  source_ref: string | null;
  symbol: string | null;
  side: "buy" | "sell" | null;
  quantity: number | null;
  price: number | null;
  fee: number | null;
  amount: number | null;
  currency: string;
  occurred_at: string;
  description: string | null;
  reference: string | null;
  raw_data_json: string | null;
  error_message: string | null;
  created_at: string;
};

type CashRow = {
  id: number;
  account_id: number;
  statement_row_id: number;
  transaction_type: CashTransactionType;
  amount: number;
  currency: string;
  occurred_at: string;
  description: string | null;
  reference: string | null;
  created_at: string;
  updated_at: string;
};

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    institution: row.institution,
    accountMask: row.account_mask,
    accountHash: row.account_hash,
    accountType: row.account_type,
    currency: row.currency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStatement(row: StatementRowDb): Statement {
  let warnings: string[] = [];
  try {
    warnings = JSON.parse(row.warnings_json) as string[];
  } catch {
    warnings = [];
  }

  return {
    id: row.id,
    accountId: row.account_id,
    institution: row.institution,
    accountMask: row.account_mask,
    accountType: row.account_type,
    currency: row.currency,
    fileName: row.file_name,
    filePath: row.file_path,
    format: row.format,
    sha256: row.sha256,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    parserId: row.parser_id,
    parserVersion: row.parser_version,
    status: row.status,
    errorSummary: row.error_summary,
    warnings,
    parsedCount: row.parsed_count,
    insertedCount: row.inserted_count,
    dedupedCount: row.deduped_count,
    rejectedCount: row.rejected_count,
    reprocessOfStatementId: row.reprocess_of_statement_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStatementRow(row: StatementDetailRowDb): StatementRow {
  return {
    id: row.id,
    statementId: row.statement_id,
    accountId: row.account_id,
    rowIndex: row.row_index,
    recordType: row.record_type,
    fingerprint: row.fingerprint,
    status: row.status,
    sourceRef: row.source_ref,
    symbol: row.symbol,
    side: row.side,
    quantity: row.quantity,
    price: row.price,
    fee: row.fee,
    amount: row.amount,
    currency: row.currency,
    occurredAt: row.occurred_at,
    description: row.description,
    reference: row.reference,
    rawData: row.raw_data_json,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function mapCash(row: CashRow): CashTransaction {
  return {
    id: row.id,
    accountId: row.account_id,
    statementRowId: row.statement_row_id,
    transactionType: row.transaction_type,
    amount: row.amount,
    currency: row.currency,
    occurredAt: row.occurred_at,
    description: row.description,
    reference: row.reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getOrCreateAccount(input: {
  institution: string;
  accountMask: string;
  accountHash: string;
  accountType: AccountType;
  currency: string;
}) {
  const db = getDb();
  const existing = db
    .prepare(
      `
      SELECT *
      FROM accounts
      WHERE institution = ?
        AND account_hash = ?
        AND account_type = ?
        AND currency = ?
      `,
    )
    .get(
      input.institution,
      input.accountHash,
      input.accountType,
      input.currency,
    ) as AccountRow | undefined;

  if (existing) {
    if (existing.account_mask !== input.accountMask) {
      db.prepare(
        `
        UPDATE accounts
        SET account_mask = ?, updated_at = datetime('now')
        WHERE id = ?
        `,
      ).run(input.accountMask, existing.id);

      return {
        ...mapAccount(existing),
        accountMask: input.accountMask,
      };
    }

    return mapAccount(existing);
  }

  const result = db
    .prepare(
      `
      INSERT INTO accounts (institution, account_mask, account_hash, account_type, currency)
      VALUES (?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.institution,
      input.accountMask,
      input.accountHash,
      input.accountType,
      input.currency,
    );

  const created = db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as AccountRow;

  return mapAccount(created);
}

export function getAccountById(accountId: number) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM accounts WHERE id = ?")
    .get(accountId) as AccountRow | undefined;

  return row ? mapAccount(row) : null;
}

export function createStatement(input: {
  accountId: number;
  fileName: string;
  filePath: string;
  format: "pdf" | "csv";
  sha256: string;
  periodStart: string | null;
  periodEnd: string | null;
  parserId: string;
  parserVersion: string;
  status: StatementIngestStatus;
  errorSummary?: string | null;
  warnings?: string[];
  counts?: StatementIngestCounts;
  reprocessOfStatementId?: number | null;
}) {
  const db = getDb();
  const counts = input.counts ?? {
    parsed: 0,
    inserted: 0,
    deduped: 0,
    rejected: 0,
  };

  const result = db
    .prepare(
      `
      INSERT INTO statements (
        account_id,
        file_name,
        file_path,
        format,
        sha256,
        period_start,
        period_end,
        parser_id,
        parser_version,
        status,
        error_summary,
        warnings_json,
        parsed_count,
        inserted_count,
        deduped_count,
        rejected_count,
        reprocess_of_statement_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.accountId,
      input.fileName,
      input.filePath,
      input.format,
      input.sha256,
      input.periodStart,
      input.periodEnd,
      input.parserId,
      input.parserVersion,
      input.status,
      input.errorSummary ?? null,
      JSON.stringify(input.warnings ?? []),
      counts.parsed,
      counts.inserted,
      counts.deduped,
      counts.rejected,
      input.reprocessOfStatementId ?? null,
    );

  return getStatementById(Number(result.lastInsertRowid));
}

export function updateStatement(
  statementId: number,
  input: {
    status: StatementIngestStatus;
    errorSummary?: string | null;
    warnings?: string[];
    periodStart?: string | null;
    periodEnd?: string | null;
    counts: StatementIngestCounts;
  },
) {
  const db = getDb();
  db.prepare(
    `
    UPDATE statements
    SET status = ?,
        error_summary = ?,
        warnings_json = ?,
        period_start = ?,
        period_end = ?,
        parsed_count = ?,
        inserted_count = ?,
        deduped_count = ?,
        rejected_count = ?,
        updated_at = datetime('now')
    WHERE id = ?
    `,
  ).run(
    input.status,
    input.errorSummary ?? null,
    JSON.stringify(input.warnings ?? []),
    input.periodStart ?? null,
    input.periodEnd ?? null,
    input.counts.parsed,
    input.counts.inserted,
    input.counts.deduped,
    input.counts.rejected,
    statementId,
  );

  return getStatementById(statementId);
}

export function listStatements() {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT
        s.*, a.institution, a.account_mask, a.account_type, a.currency
      FROM statements s
      JOIN accounts a ON a.id = s.account_id
      ORDER BY s.created_at DESC, s.id DESC
      `,
    )
    .all() as StatementRowDb[];

  return rows.map(mapStatement);
}

export function getStatementById(statementId: number) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT
        s.*, a.institution, a.account_mask, a.account_type, a.currency
      FROM statements s
      JOIN accounts a ON a.id = s.account_id
      WHERE s.id = ?
      `,
    )
    .get(statementId) as StatementRowDb | undefined;

  return row ? mapStatement(row) : null;
}

export function listStatementRows(statementId: number) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT *
      FROM statement_rows
      WHERE statement_id = ?
      ORDER BY row_index ASC
      `,
    )
    .all(statementId) as StatementDetailRowDb[];

  return rows.map(mapStatementRow);
}

export function createStatementRow(input: {
  statementId: number;
  accountId: number;
  rowIndex: number;
  recordType: "trade" | "cash_movement";
  fingerprint: string;
  status: StatementRowStatus;
  sourceRef?: string | null;
  symbol?: string | null;
  side?: "buy" | "sell" | null;
  quantity?: number | null;
  price?: number | null;
  fee?: number | null;
  amount?: number | null;
  currency: string;
  occurredAt: string;
  description?: string | null;
  reference?: string | null;
  rawData?: Record<string, unknown> | null;
  errorMessage?: string | null;
}) {
  const db = getDb();
  const result = db
    .prepare(
      `
      INSERT INTO statement_rows (
        statement_id,
        account_id,
        row_index,
        record_type,
        fingerprint,
        status,
        source_ref,
        symbol,
        side,
        quantity,
        price,
        fee,
        amount,
        currency,
        occurred_at,
        description,
        reference,
        raw_data_json,
        error_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.statementId,
      input.accountId,
      input.rowIndex,
      input.recordType,
      input.fingerprint,
      input.status,
      input.sourceRef ?? null,
      input.symbol ?? null,
      input.side ?? null,
      input.quantity ?? null,
      input.price ?? null,
      input.fee ?? null,
      input.amount ?? null,
      input.currency,
      input.occurredAt,
      input.description ?? null,
      input.reference ?? null,
      input.rawData ? JSON.stringify(input.rawData) : null,
      input.errorMessage ?? null,
    );

  const row = db
    .prepare("SELECT * FROM statement_rows WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as StatementDetailRowDb;

  return mapStatementRow(row);
}

export function updateStatementRowStatus(
  rowId: number,
  input: {
    status: StatementRowStatus;
    errorMessage?: string | null;
  },
) {
  const db = getDb();
  db.prepare(
    `
    UPDATE statement_rows
    SET status = ?, error_message = ?
    WHERE id = ?
    `,
  ).run(input.status, input.errorMessage ?? null, rowId);
}

export function findInsertedStatementRowByFingerprint(accountId: number, fingerprint: string) {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT *
      FROM statement_rows
      WHERE account_id = ?
        AND fingerprint = ?
        AND status = 'inserted'
      LIMIT 1
      `,
    )
    .get(accountId, fingerprint) as StatementDetailRowDb | undefined;

  return row ? mapStatementRow(row) : null;
}

export function createCashTransaction(input: {
  accountId: number;
  statementRowId: number;
  transactionType: CashTransactionType;
  amount: number;
  currency: string;
  occurredAt: string;
  description?: string | null;
  reference?: string | null;
}) {
  const db = getDb();
  const result = db
    .prepare(
      `
      INSERT INTO cash_transactions (
        account_id,
        statement_row_id,
        transaction_type,
        amount,
        currency,
        occurred_at,
        description,
        reference
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      input.accountId,
      input.statementRowId,
      input.transactionType,
      input.amount,
      input.currency,
      input.occurredAt,
      input.description ?? null,
      input.reference ?? null,
    );

  const row = db
    .prepare("SELECT * FROM cash_transactions WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as CashRow;

  return mapCash(row);
}

export function listCashTransactionsByAccount(accountId: number) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT *
      FROM cash_transactions
      WHERE account_id = ?
      ORDER BY occurred_at DESC, id DESC
      `,
    )
    .all(accountId) as CashRow[];

  return rows.map(mapCash);
}

export function createImportRun(input: {
  statementId: number;
  runType: "initial" | "reprocess";
  status: "completed" | "failed";
  errorSummary?: string | null;
}) {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO import_runs (statement_id, run_type, status, error_summary)
    VALUES (?, ?, ?, ?)
    `,
  ).run(input.statementId, input.runType, input.status, input.errorSummary ?? null);
}

export function applyTradeRecord(record: NormalizedTradeRecord) {
  return createTrade({
    symbol: normalizeSymbol(record.symbol),
    assetType: record.assetType,
    side: record.side,
    quantity: record.quantity,
    price: record.price,
    fee: record.fee,
    tradedAt: record.tradedAt,
    notes: record.description ?? null,
  });
}

export function canApplyTradeRecord(record: NormalizedTradeRecord) {
  const asset = getOrCreateAsset({
    symbol: normalizeSymbol(record.symbol),
    assetType: record.assetType,
  });
  if (!asset) {
    return false;
  }

  const trades = listTradesByAsset(asset.id);
  const candidate = [
    ...trades,
    {
      id: Number.MAX_SAFE_INTEGER,
      assetId: asset.id,
      symbol: normalizeSymbol(record.symbol),
      assetType: record.assetType,
      side: record.side,
      quantity: record.quantity,
      price: record.price,
      fee: record.fee,
      tradedAt: record.tradedAt,
      notes: record.description ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  calculatePositionFromTrades(
    candidate.map((trade) => ({
      id: trade.id,
      side: trade.side,
      quantity: trade.quantity,
      price: trade.price,
      fee: trade.fee,
      tradedAt: trade.tradedAt,
    })),
  );

  return true;
}

export function isTradePersisted(tradeId: number) {
  return getTradeById(tradeId) !== null;
}

export function applyCashRecord(accountId: number, statementRowId: number, record: NormalizedCashMovementRecord) {
  return createCashTransaction({
    accountId,
    statementRowId,
    transactionType: record.transactionType,
    amount: record.amount,
    currency: record.currency,
    occurredAt: record.occurredAt,
    description: record.description ?? null,
    reference: record.reference ?? null,
  });
}
