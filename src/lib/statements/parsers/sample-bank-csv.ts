import type { ParserAdapter } from "@/lib/types";
import { parseCsv } from "@/lib/statements/csv";

function getRequiredField(row: Record<string, string>, field: string) {
  const value = row[field];
  if (!value) {
    throw new Error(`Missing required field: ${field}`);
  }

  return value;
}

function toRecord(headers: string[], values: string[]) {
  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[header.trim().toLowerCase()] = (values[index] ?? "").trim();
  });

  return row;
}

export const sampleBankCsvParser: ParserAdapter = {
  id: "sample-bank-csv",
  version: "1.0.0",
  institution: "samplebank",
  formats: ["csv"],
  canParse(context) {
    return context.institution.toLowerCase() === "samplebank" && context.format === "csv";
  },
  parse(input) {
    const { headers, rows } = parseCsv(input.text);
    if (headers.length === 0) {
      throw new Error("CSV file has no headers");
    }

    const records = rows.map((values, index) => {
      const row = toRecord(headers, values);
      const rowType = (row.type || "").toUpperCase();
      const isoDate = new Date(getRequiredField(row, "date")).toISOString();

      if (rowType === "TRADE") {
        const rawSide = getRequiredField(row, "side").toUpperCase();
        const side = rawSide === "BUY" ? "buy" : rawSide === "SELL" ? "sell" : null;
        if (!side) {
          throw new Error(`Row ${index + 2}: invalid trade side`);
        }

        return {
          recordType: "trade" as const,
          sourceRef: row.source_ref || `line:${index + 2}`,
          tradedAt: isoDate,
          symbol: getRequiredField(row, "symbol").toUpperCase(),
          assetType: (row.asset_type || "equity") === "crypto" ? "crypto" : "equity",
          side,
          quantity: Number(getRequiredField(row, "quantity")),
          price: Number(getRequiredField(row, "price")),
          fee: Number(row.fee || "0"),
          currency: (row.currency || input.context.currency || "CAD").toUpperCase(),
          description: row.description || null,
          reference: row.reference || null,
          raw: row,
        };
      }

      if (rowType === "CASH") {
        const transactionType = (row.transaction_type || "").toLowerCase();
        if (!transactionType) {
          throw new Error(`Row ${index + 2}: transaction_type is required for CASH rows`);
        }

        return {
          recordType: "cash_movement" as const,
          sourceRef: row.source_ref || `line:${index + 2}`,
          occurredAt: isoDate,
          transactionType: transactionType as
            | "deposit"
            | "withdrawal"
            | "dividend"
            | "interest"
            | "fee"
            | "transfer",
          amount: Number(getRequiredField(row, "amount")),
          currency: (row.currency || input.context.currency || "CAD").toUpperCase(),
          description: row.description || null,
          reference: row.reference || null,
          raw: row,
        };
      }

      throw new Error(`Row ${index + 2}: unsupported row type`);
    });

    const periodStart = rows.length > 0 ? new Date(toRecord(headers, rows[0]).date).toISOString() : null;
    const periodEnd = rows.length > 0
      ? new Date(toRecord(headers, rows[rows.length - 1]).date).toISOString()
      : null;

    return {
      periodStart,
      periodEnd,
      records,
      warnings: [],
    };
  },
};
