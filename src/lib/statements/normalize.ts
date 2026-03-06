import type { NormalizedCashMovementRecord, NormalizedStatementRecord, NormalizedTradeRecord } from "@/lib/types";

function assertIsoDate(value: string, label: string) {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid date`);
  }
}

function normalizeTrade(record: NormalizedTradeRecord): NormalizedTradeRecord {
  assertIsoDate(record.tradedAt, "Trade date");

  if (!record.symbol.trim()) {
    throw new Error("Trade symbol is required");
  }

  if (record.quantity <= 0) {
    throw new Error("Trade quantity must be greater than 0");
  }

  if (record.price <= 0) {
    throw new Error("Trade price must be greater than 0");
  }

  if (record.fee < 0) {
    throw new Error("Trade fee must be at least 0");
  }

  return {
    ...record,
    symbol: record.symbol.trim().toUpperCase(),
    currency: record.currency.trim().toUpperCase(),
    description: record.description?.trim() || null,
    reference: record.reference?.trim() || null,
    sourceRef: record.sourceRef?.trim() || null,
    tradedAt: new Date(record.tradedAt).toISOString(),
  };
}

function normalizeCash(record: NormalizedCashMovementRecord): NormalizedCashMovementRecord {
  assertIsoDate(record.occurredAt, "Cash movement date");

  if (record.amount === 0) {
    throw new Error("Cash movement amount cannot be zero");
  }

  return {
    ...record,
    currency: record.currency.trim().toUpperCase(),
    description: record.description?.trim() || null,
    reference: record.reference?.trim() || null,
    sourceRef: record.sourceRef?.trim() || null,
    occurredAt: new Date(record.occurredAt).toISOString(),
  };
}

export function normalizeStatementRecords(records: NormalizedStatementRecord[]) {
  return records.map((record) =>
    record.recordType === "trade" ? normalizeTrade(record) : normalizeCash(record),
  );
}
