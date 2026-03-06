import { getDb } from "@/lib/db";
import { getPortfolioSnapshot } from "@/lib/portfolio-service";
import { resetQuestradeRuntimeForTests } from "@/lib/questrade";
import { importYahooPortfolioCsv } from "@/lib/yahoo-import";

describe.sequential("Yahoo import integration", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec(`
      DELETE FROM broker_accounts;
      DELETE FROM portfolio_cash_transactions;
      DELETE FROM quote_cache;
      DELETE FROM trades;
      DELETE FROM assets;
      DELETE FROM net_worth_entries;
      DELETE FROM portfolios WHERE id <> 1;
    `);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetQuestradeRuntimeForTests();
  });

  it("imports holdings and cash then reflects in portfolio snapshot", async () => {
    const csv = [
      "Symbol,Current Price,Date,Time,Change,Open,High,Low,Volume,Trade Date,Purchase Price,Quantity,Commission,High Limit,Low Limit,Comment,Transaction Type",
      "$$CASH_TX,,,,,,,,,20260105,,1571.08,,,,,DEPOSIT",
      "$$CASH_TX,,,,,,,,,20260227,,500.00,,,,,WITHDRAWAL",
      "VDY.TO,65.94,2026/03/06,15:59 EST,-0.86,66.5,66.5,65.75,301845,20260203,63.75,45.0,0.0,,,,",
    ].join("\n");

    const result = importYahooPortfolioCsv(1, csv);
    expect(result.counts.parsed).toBe(3);
    expect(result.counts.rejected).toBe(0);
    expect(result.counts.inserted + result.counts.deduped).toBe(3);

    process.env.QUESTRADE_REFRESH_TOKEN = "test-refresh-token";
    process.env.QUESTRADE_IS_PRACTICE = "false";
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "next-refresh-token",
            expires_in: 1800,
            api_server: "https://api01.iq.questrade.com/",
            token_type: "Bearer",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            symbols: [{ symbol: "VDY.TO", symbolId: 123 }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            quotes: [{ lastTradePrice: 66, lastTradeTime: "2026-01-01T15:30:00.000000-05:00" }],
          }),
        ),
      );

    const snapshot = await getPortfolioSnapshot(1, true);
    expect(snapshot.trades).toHaveLength(1);
    expect(snapshot.cash.balance).toBeCloseTo(1071.08, 2);
    expect(snapshot.cash.transactionCount).toBe(2);
    expect(snapshot.holdings[0]?.symbol).toBe("VDY.TO");
  });

  it("rejects rows with malformed dates", () => {
    const csv = [
      "Symbol,Trade Date,Purchase Price,Quantity,Commission,Transaction Type",
      "VDY.TO,2026-02-03,63.75,45,0,",
    ].join("\n");

    const result = importYahooPortfolioCsv(1, csv);
    expect(result.counts.parsed).toBe(1);
    expect(result.counts.rejected).toBe(1);
    expect(result.errors[0]).toMatch(/invalid trade date/i);
  });

  it("dedupes repeat uploads", () => {
    const csv = [
      "Symbol,Trade Date,Purchase Price,Quantity,Commission,Transaction Type",
      "$$CASH_TX,20260105,,1000,0,DEPOSIT",
      "XSB.TO,20260113,27.03,650.0,0.0,",
    ].join("\n");

    const first = importYahooPortfolioCsv(1, csv);
    const second = importYahooPortfolioCsv(1, csv);

    expect(first.counts.inserted).toBe(2);
    expect(second.counts.inserted).toBe(0);
    expect(second.counts.deduped).toBe(2);
  });
});
