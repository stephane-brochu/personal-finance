import { createHash } from "node:crypto";
import type { NormalizedStatementRecord } from "@/lib/types";

function tradeFingerprintPayload(record: Extract<NormalizedStatementRecord, { recordType: "trade" }>) {
  return [
    "trade",
    record.tradedAt,
    record.symbol.toUpperCase(),
    record.assetType,
    record.side,
    record.quantity.toFixed(8),
    record.price.toFixed(8),
    record.fee.toFixed(8),
    record.currency.toUpperCase(),
    record.reference ?? "",
  ].join("|");
}

function cashFingerprintPayload(
  record: Extract<NormalizedStatementRecord, { recordType: "cash_movement" }>,
) {
  return [
    "cash",
    record.occurredAt,
    record.transactionType,
    record.amount.toFixed(8),
    record.currency.toUpperCase(),
    record.reference ?? "",
    record.description ?? "",
  ].join("|");
}

export function createStatementRowFingerprint(accountId: number, record: NormalizedStatementRecord) {
  const payload =
    record.recordType === "trade"
      ? tradeFingerprintPayload(record)
      : cashFingerprintPayload(record);

  return createHash("sha256")
    .update(`${accountId}|${payload}`)
    .digest("hex");
}
