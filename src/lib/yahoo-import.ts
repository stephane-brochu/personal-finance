import { createHash } from "node:crypto";
import { parseCsv } from "@/lib/csv";
import {
  createCashTransaction,
  createTrade,
  getCashTransactionByFingerprint,
  getTradeByImportFingerprint,
} from "@/lib/repository";
import type { YahooImportResult } from "@/lib/types";

type YahooCsvRow = {
  symbol: string;
  tradeDate: string;
  purchasePrice: string;
  quantity: string;
  commission: string;
  transactionType: string;
};

function toRow(headers: string[], values: string[]): YahooCsvRow {
  const map = new Map<string, string>();
  headers.forEach((header, index) => {
    map.set(header.trim().toLowerCase(), values[index] ?? "");
  });

  return {
    symbol: map.get("symbol") ?? "",
    tradeDate: map.get("trade date") ?? "",
    purchasePrice: map.get("purchase price") ?? "",
    quantity: map.get("quantity") ?? "",
    commission: map.get("commission") ?? "",
    transactionType: map.get("transaction type") ?? "",
  };
}

function parseYahooDate(raw: string) {
  const value = raw.trim();
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`Invalid Trade Date '${raw}'`);
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));

  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

function inferAssetType(symbol: string) {
  const upper = symbol.trim().toUpperCase();
  if (upper.endsWith("-USD") || upper === "BTC" || upper === "ETH" || upper === "SOL") {
    return "crypto" as const;
  }

  return "equity" as const;
}

function buildFingerprint(kind: "trade" | "cash", payload: string) {
  return createHash("sha256").update(`${kind}|${payload}`).digest("hex");
}

function createTradeFingerprint(input: {
  symbol: string;
  tradedAt: string;
  quantity: number;
  price: number;
  fee: number;
}) {
  return buildFingerprint(
    "trade",
    [
      input.symbol.toUpperCase(),
      input.tradedAt,
      input.quantity.toFixed(8),
      input.price.toFixed(8),
      input.fee.toFixed(8),
    ].join("|"),
  );
}

function createCashFingerprint(input: {
  transactionType: "deposit" | "withdrawal";
  occurredAt: string;
  amount: number;
}) {
  return buildFingerprint(
    "cash",
    [input.transactionType, input.occurredAt, input.amount.toFixed(2)].join("|"),
  );
}

function parsePositiveNumber(value: string, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${field} must be greater than 0`);
  }
  return parsed;
}

function parseNonNegativeNumber(value: string, field: string) {
  const parsed = Number(value || "0");
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${field} must be 0 or greater`);
  }
  return parsed;
}

export function importYahooPortfolioCsv(
  portfolioId: number,
  csvText: string,
): YahooImportResult {
  const { headers, rows } = parseCsv(csvText);

  if (headers.length === 0) {
    throw new Error("CSV is empty");
  }

  const counts = {
    parsed: rows.length,
    inserted: 0,
    deduped: 0,
    rejected: 0,
  };
  const warnings: string[] = [];
  const errors: string[] = [];

  rows.forEach((values, index) => {
    const rowNumber = index + 2;
    try {
      const row = toRow(headers, values);
      const symbol = row.symbol.trim().toUpperCase();

      if (!symbol) {
        throw new Error("Symbol is required");
      }

      const occurredAt = parseYahooDate(row.tradeDate);

      if (symbol === "$$CASH_TX") {
        const quantity = parsePositiveNumber(row.quantity, "Quantity");
        const txTypeRaw = row.transactionType.trim().toUpperCase();
        const transactionType =
          txTypeRaw === "DEPOSIT"
            ? "deposit"
            : txTypeRaw === "WITHDRAWAL"
              ? "withdrawal"
              : null;

        if (!transactionType) {
          throw new Error(`Unsupported cash transaction type '${row.transactionType}'`);
        }

        const signedAmount = transactionType === "deposit" ? quantity : -quantity;
        const fingerprint = createCashFingerprint({
          transactionType,
          occurredAt,
          amount: signedAmount,
        });

        if (getCashTransactionByFingerprint(portfolioId, fingerprint)) {
          counts.deduped += 1;
          return;
        }

        createCashTransaction({
          portfolioId,
          transactionType,
          amount: signedAmount,
          occurredAt,
          source: "yahoo_csv",
          fingerprint,
        });

        counts.inserted += 1;
        return;
      }

      const price = parsePositiveNumber(row.purchasePrice, "Purchase Price");
      const quantity = parsePositiveNumber(row.quantity, "Quantity");
      const fee = parseNonNegativeNumber(row.commission, "Commission");
      const fingerprint = createTradeFingerprint({
        symbol,
        tradedAt: occurredAt,
        quantity,
        price,
        fee,
      });

      if (getTradeByImportFingerprint(portfolioId, fingerprint)) {
        counts.deduped += 1;
        return;
      }

      createTrade({
        portfolioId,
        symbol,
        assetType: inferAssetType(symbol),
        source: "yahoo_csv",
        side: "buy",
        quantity,
        price,
        fee,
        tradedAt: occurredAt,
        notes: "Imported from Yahoo portfolio CSV",
        importFingerprint: fingerprint,
      });
      counts.inserted += 1;
    } catch (error) {
      counts.rejected += 1;
      const message = error instanceof Error ? error.message : "Unknown import error";
      errors.push(`Row ${rowNumber}: ${message}`);
    }
  });

  if (rows.length === 0) {
    warnings.push("No data rows were found in the uploaded CSV");
  }

  return {
    counts,
    warnings,
    errors,
  };
}
