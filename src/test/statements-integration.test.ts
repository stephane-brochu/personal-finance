import { getDb } from "@/lib/db";
import { getPortfolioSnapshot } from "@/lib/portfolio-service";
import { createTrade } from "@/lib/repository";
import { importStatement } from "@/lib/statements/service";

describe.sequential("statement import integration", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec(`
      DELETE FROM import_runs;
      DELETE FROM cash_transactions;
      DELETE FROM statement_rows;
      DELETE FROM statements;
      DELETE FROM accounts;
      DELETE FROM quote_cache;
      DELETE FROM trades;
      DELETE FROM assets;
    `);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("imports rows and surfaces imported trade in portfolio snapshot", async () => {
    const csv = [
      "date,type,symbol,asset_type,side,quantity,price,fee,transaction_type,amount,currency,description,reference",
      "2026-01-02,TRADE,AAPL,equity,BUY,2,120,1,,,CAD,Buy shares,REF-1",
      "2026-01-03,CASH,,,,,,,deposit,500,CAD,Account funding,REF-2",
    ].join("\n");

    const result = importStatement({
      institution: "samplebank",
      accountMask: "****1234",
      accountType: "brokerage",
      fileName: "jan.csv",
      fileBuffer: Buffer.from(csv, "utf8"),
      format: "csv",
    });

    expect(result.counts.parsed).toBe(2);
    expect(result.counts.inserted).toBe(2);
    expect(result.statement.status).toBe("completed");

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          quoteResponse: {
            result: [{ regularMarketPrice: 130, regularMarketTime: 1735689600 }],
          },
        }),
      ),
    );

    const snapshot = await getPortfolioSnapshot(true);
    const holding = snapshot.holdings.find((item) => item.symbol === "AAPL");

    expect(snapshot.trades.length).toBe(1);
    expect(holding?.quantity).toBe(2);
    expect(holding?.marketPrice).toBe(130);
  });

  it("dedupes rows on re-upload", () => {
    const csv = [
      "date,type,symbol,asset_type,side,quantity,price,fee,transaction_type,amount,currency,description,reference",
      "2026-01-02,TRADE,SHOP,equity,BUY,1,100,0,,,CAD,Buy,REF-X",
      "2026-01-03,CASH,,,,,,,deposit,200,CAD,Funding,REF-Y",
    ].join("\n");

    const first = importStatement({
      institution: "samplebank",
      accountMask: "****9999",
      accountType: "brokerage",
      fileName: "jan.csv",
      fileBuffer: Buffer.from(csv, "utf8"),
      format: "csv",
    });

    const second = importStatement({
      institution: "samplebank",
      accountMask: "****9999",
      accountType: "brokerage",
      fileName: "jan.csv",
      fileBuffer: Buffer.from(csv, "utf8"),
      format: "csv",
    });

    expect(first.counts.inserted).toBe(2);
    expect(second.counts.inserted).toBe(0);
    expect(second.counts.deduped).toBe(2);
  });

  it("records failed statement when parser cannot normalize rows", () => {
    const badCsv = ["date,type", "2026-01-02,INVALID"].join("\n");

    const result = importStatement({
      institution: "samplebank",
      accountMask: "****4321",
      accountType: "brokerage",
      fileName: "bad.csv",
      fileBuffer: Buffer.from(badCsv, "utf8"),
      format: "csv",
    });

    expect(result.statement.status).toBe("failed");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("keeps manual trade CRUD path usable", () => {
    const trade = createTrade({
      symbol: "MSFT",
      assetType: "equity",
      side: "buy",
      quantity: 1,
      price: 100,
      fee: 0,
      tradedAt: new Date("2026-02-01T00:00:00.000Z").toISOString(),
      notes: null,
    });

    expect(trade?.symbol).toBe("MSFT");
  });
});
