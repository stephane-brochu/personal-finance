import type { ParserAdapter } from "@/lib/types";

const TRADE_RE = /^TRADE\|([^|]+)\|(BUY|SELL)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|?(.*)$/i;
const CASH_RE = /^CASH\|([^|]+)\|(DEPOSIT|WITHDRAWAL|DIVIDEND|INTEREST|FEE|TRANSFER)\|([^|]+)\|([^|]*)\|?(.*)$/i;
const PERIOD_RE = /^PERIOD:\s*([0-9\-]+)\s+to\s+([0-9\-]+)$/i;

export const sampleBrokerPdfParser: ParserAdapter = {
  id: "sample-broker-pdf",
  version: "1.0.0",
  institution: "samplebroker",
  formats: ["pdf"],
  canParse(context) {
    return context.institution.toLowerCase() === "samplebroker" && context.format === "pdf";
  },
  parse(input) {
    const lines = input.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    const records = [] as ReturnType<ParserAdapter["parse"]>["records"];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const periodMatch = line.match(PERIOD_RE);
      if (periodMatch) {
        periodStart = new Date(periodMatch[1]).toISOString();
        periodEnd = new Date(periodMatch[2]).toISOString();
        continue;
      }

      const tradeMatch = line.match(TRADE_RE);
      if (tradeMatch) {
        const [, date, side, symbol, quantity, price, fee, reference] = tradeMatch;
        records.push({
          recordType: "trade",
          sourceRef: `line:${index + 1}`,
          tradedAt: new Date(date).toISOString(),
          symbol: symbol.trim().toUpperCase(),
          assetType: "equity",
          side: side.toLowerCase() as "buy" | "sell",
          quantity: Number(quantity),
          price: Number(price),
          fee: Number(fee),
          currency: input.context.currency || "CAD",
          description: "Imported from PDF statement",
          reference: reference?.trim() || null,
          raw: { line },
        });
        continue;
      }

      const cashMatch = line.match(CASH_RE);
      if (cashMatch) {
        const [, date, transactionType, amount, description, reference] = cashMatch;
        records.push({
          recordType: "cash_movement",
          sourceRef: `line:${index + 1}`,
          occurredAt: new Date(date).toISOString(),
          transactionType: transactionType.toLowerCase() as
            | "deposit"
            | "withdrawal"
            | "dividend"
            | "interest"
            | "fee"
            | "transfer",
          amount: Number(amount),
          currency: input.context.currency || "CAD",
          description: description || null,
          reference: reference?.trim() || null,
          raw: { line },
        });
      }
    }

    if (records.length === 0) {
      throw new Error("No parseable records found in PDF. Ensure the statement follows parser format");
    }

    return {
      periodStart,
      periodEnd,
      records,
      warnings: [],
    };
  },
};
