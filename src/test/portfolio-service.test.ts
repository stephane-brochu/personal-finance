vi.mock("@/lib/repository", () => ({
  getPortfolioById: vi.fn((portfolioId: number) => ({
    id: portfolioId,
    name: `Questrade ${portfolioId}`,
    brokerProvider: "questrade",
    brokerAccountNumber: String(portfolioId),
    createdAt: "",
    updatedAt: "",
  })),
  getAssets: vi.fn(() => [
    {
      id: 1,
      symbol: "VDY.TO",
      assetType: "equity",
      name: null,
      createdAt: "",
      updatedAt: "",
    },
  ]),
  listTrades: vi.fn(() => [
    {
      id: 1,
      portfolioId: 1,
      assetId: 1,
      symbol: "VDY.TO",
      assetType: "equity",
      source: "questrade_position_snapshot",
      side: "buy",
      quantity: 10,
      price: 50,
      fee: 0,
      tradedAt: "2026-03-01T00:00:00.000Z",
      notes: null,
      createdAt: "",
      updatedAt: "",
    },
  ]),
  listCashTransactions: vi.fn(() => []),
  listPortfoliosByBrokerProvider: vi.fn(() => [
    {
      id: 1,
      name: "Questrade 1",
      brokerProvider: "questrade",
      brokerAccountNumber: "1",
      createdAt: "",
      updatedAt: "",
    },
  ]),
}));

vi.mock("@/lib/quotes", () => ({
  getQuotesForAssets: vi.fn(() => ({
    quotes: new Map([
      [
        1,
        {
          assetId: 1,
          symbol: "VDY.TO",
          assetType: "equity",
          price: 65,
          quotedAt: "2026-03-05T16:00:00.000Z",
          source: "questrade",
          stale: true,
        },
      ],
    ]),
    warnings: [],
  })),
}));

import { getBrokerPortfolioSnapshots, getPortfolioSnapshot } from "@/lib/portfolio-service";

describe("portfolio service", () => {
  it("adds warning when quote is not from today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T18:00:00.000Z"));

    const snapshot = await getPortfolioSnapshot(1, true);
    expect(snapshot.quoteWarnings).toContain("Using non-today quote for VDY.TO");

    vi.useRealTimers();
  });

  it("returns broker account portfolios in stable order", async () => {
    const snapshots = await getBrokerPortfolioSnapshots("questrade", false);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.portfolio.brokerProvider).toBe("questrade");
  });
});
