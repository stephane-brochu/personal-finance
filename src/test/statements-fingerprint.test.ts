import { createStatementRowFingerprint } from "@/lib/statements/fingerprint";
import type { NormalizedStatementRecord } from "@/lib/types";

describe("statement row fingerprints", () => {
  it("is stable for equivalent trade rows", () => {
    const record: NormalizedStatementRecord = {
      recordType: "trade",
      tradedAt: "2026-01-15T10:00:00.000Z",
      symbol: "AAPL",
      assetType: "equity",
      side: "buy",
      quantity: 10,
      price: 100,
      fee: 1,
      currency: "CAD",
      reference: "ABC-123",
    };

    const one = createStatementRowFingerprint(1, record);
    const two = createStatementRowFingerprint(1, { ...record });

    expect(one).toBe(two);
  });

  it("changes with account id", () => {
    const record: NormalizedStatementRecord = {
      recordType: "cash_movement",
      occurredAt: "2026-01-20T12:00:00.000Z",
      transactionType: "deposit",
      amount: 1000,
      currency: "CAD",
      description: "Funding",
      reference: "DEP-1",
    };

    const one = createStatementRowFingerprint(1, record);
    const two = createStatementRowFingerprint(2, record);

    expect(one).not.toBe(two);
  });
});
