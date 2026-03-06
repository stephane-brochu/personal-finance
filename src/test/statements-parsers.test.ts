import { sampleBankCsvParser } from "@/lib/statements/parsers/sample-bank-csv";
import { sampleBrokerPdfParser } from "@/lib/statements/parsers/sample-broker-pdf";

describe("statement parser adapters", () => {
  it("parses samplebank CSV trade + cash rows", () => {
    const csv = [
      "date,type,symbol,asset_type,side,quantity,price,fee,transaction_type,amount,currency,description,reference",
      "2026-01-02,TRADE,AAPL,equity,BUY,2,120,1,,,CAD,Buy shares,REF-1",
      "2026-01-03,CASH,,,,,,,deposit,500,CAD,Account funding,REF-2",
    ].join("\n");

    const result = sampleBankCsvParser.parse({
      text: csv,
      fileName: "sample.csv",
      context: {
        institution: "samplebank",
        accountType: "brokerage",
        currency: "CAD",
        fileName: "sample.csv",
        format: "csv",
      },
    });

    expect(result.records).toHaveLength(2);
    expect(result.records[0].recordType).toBe("trade");
    expect(result.records[1].recordType).toBe("cash_movement");
  });

  it("parses samplebroker PDF extracted text rows", () => {
    const text = [
      "PERIOD: 2026-01-01 to 2026-01-31",
      "TRADE|2026-01-05|BUY|AAPL|3|123.45|1.99|T-1",
      "CASH|2026-01-06|DIVIDEND|12.50|AAPL dividend|C-1",
    ].join("\n");

    const result = sampleBrokerPdfParser.parse({
      text,
      fileName: "sample.pdf",
      context: {
        institution: "samplebroker",
        accountType: "brokerage",
        currency: "CAD",
        fileName: "sample.pdf",
        format: "pdf",
      },
    });

    expect(result.records).toHaveLength(2);
    expect(result.periodStart).toContain("2026-01-01");
    expect(result.periodEnd).toContain("2026-01-31");
  });
});
