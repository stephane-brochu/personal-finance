import { normalizeStatementRecords } from "@/lib/statements/normalize";

describe("statement normalization", () => {
  it("normalizes casing, dates and trims fields", () => {
    const [trade] = normalizeStatementRecords([
      {
        recordType: "trade",
        tradedAt: "2026-01-02",
        symbol: " aapl ",
        assetType: "equity",
        side: "buy",
        quantity: 1,
        price: 100,
        fee: 0,
        currency: " cad ",
        description: "  note  ",
      },
    ]);

    expect(trade.recordType).toBe("trade");
    if (trade.recordType === "trade") {
      expect(trade.symbol).toBe("AAPL");
      expect(trade.currency).toBe("CAD");
      expect(trade.description).toBe("note");
      expect(trade.tradedAt).toContain("T");
    }
  });

  it("rejects invalid amounts", () => {
    expect(() =>
      normalizeStatementRecords([
        {
          recordType: "cash_movement",
          occurredAt: "2026-01-03",
          transactionType: "deposit",
          amount: 0,
          currency: "CAD",
        },
      ]),
    ).toThrow(/cannot be zero/i);
  });
});
