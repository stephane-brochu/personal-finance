import { getDb } from "@/lib/db";
import { getPortfolioSnapshot } from "@/lib/portfolio-service";
import { resetQuestradeRuntimeForTests } from "@/lib/questrade";
import { syncAllQuestradeAccounts } from "@/lib/questrade-sync";

describe.sequential("Questrade sync integration", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec(`
      DELETE FROM broker_accounts;
      DELETE FROM portfolio_cash_transactions;
      DELETE FROM quote_cache;
      DELETE FROM trades;
      DELETE FROM assets;
      DELETE FROM portfolios WHERE id <> 1;
    `);
    process.env.QUESTRADE_REFRESH_TOKEN = "test-refresh-token";
    process.env.QUESTRADE_IS_PRACTICE = "false";
    resetQuestradeRuntimeForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetQuestradeRuntimeForTests();
  });

  it("syncs accounts into mapped portfolios and dedupes on rerun", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "next-refresh-token",
            expires_in: 1800,
            api_server: "https://api01.iq.questrade.com/",
            token_type: "Bearer",
          }),
        );
      }

      if (url.includes("/v1/accounts/") && url.includes("/balances")) {
        return new Response(
          JSON.stringify({
            perCurrencyBalances: [{ currency: "CAD", cash: 1000 }],
          }),
        );
      }

      if (url.includes("/v1/accounts/") && url.includes("/positions")) {
        return new Response(
          JSON.stringify({
            positions: [{ symbol: "VDY.TO", openQuantity: 10, averageEntryPrice: 50 }],
          }),
        );
      }

      if (url.includes("/v1/accounts/") && url.includes("/activities")) {
        const parsedUrl = new URL(url);
        const startTime = parsedUrl.searchParams.get("startTime");
        if (startTime && !startTime.startsWith("2024-09")) {
          return new Response(JSON.stringify({ activities: [] }));
        }

        return new Response(
          JSON.stringify({
            activities: [
              {
                action: "BUY",
                symbol: "VDY.TO",
                quantity: 10,
                price: 50,
                commission: 0,
                tradeDate: "2026-02-01T10:00:00-05:00",
              },
              {
                action: "DIV",
                transactionDate: "2026-02-05T00:00:00-05:00",
                netAmount: 12.34,
                description: "Dividend",
              },
            ],
          }),
        );
      }

      if (url.includes("/v1/accounts")) {
        return new Response(
          JSON.stringify({
            accounts: [{ number: "12345678" }],
          }),
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    const first = await syncAllQuestradeAccounts();
    expect(first.accounts).toHaveLength(1);
    expect(first.accounts[0]?.status).toBe("ok");
    expect(first.counts.inserted).toBe(4);

    const second = await syncAllQuestradeAccounts();
    expect(second.counts.inserted).toBe(0);
    expect(second.counts.deduped).toBe(4);

    const snapshot = await getPortfolioSnapshot(first.accounts[0]!.portfolioId, false);
    expect(snapshot.portfolio.name).toBe("Questrade 12345678");
    expect(snapshot.holdings[0]?.symbol).toBe("VDY.TO");
    expect(snapshot.holdings[0]?.quantity).toBe(10);
    expect(snapshot.cash.balance).toBeCloseTo(1000, 2);
  });

  it("continues after account failures and marks status", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.includes("oauth2/token")) {
        return new Response(
          JSON.stringify({
            access_token: "access-token",
            refresh_token: "next-refresh-token",
            expires_in: 1800,
            api_server: "https://api01.iq.questrade.com/",
            token_type: "Bearer",
          }),
        );
      }

      if (url.includes("/v1/accounts/1111/balances")) {
        return new Response(JSON.stringify({ perCurrencyBalances: [{ currency: "CAD", cash: 100 }] }));
      }
      if (url.includes("/v1/accounts/1111/positions")) {
        return new Response(JSON.stringify({ positions: [] }));
      }
      if (url.includes("/v1/accounts/1111/activities")) {
        return new Response(JSON.stringify({ activities: [] }));
      }

      if (url.includes("/v1/accounts/2222/balances")) {
        return new Response(JSON.stringify({ error: "bad gateway" }), { status: 502 });
      }
      if (url.includes("/v1/accounts/2222/positions")) {
        return new Response(JSON.stringify({ error: "bad gateway" }), { status: 502 });
      }
      if (url.includes("/v1/accounts/2222/activities")) {
        return new Response(JSON.stringify({ error: "bad gateway" }), { status: 502 });
      }

      if (url.includes("/v1/accounts")) {
        return new Response(
          JSON.stringify({
            accounts: [{ number: "1111" }, { number: "2222" }],
          }),
        );
      }

      return new Response(JSON.stringify({}), { status: 404 });
    });

    const result = await syncAllQuestradeAccounts();
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts.find((item) => item.accountNumber === "1111")?.status).toBe("ok");
    expect(result.accounts.find((item) => item.accountNumber === "2222")?.status).toBe("failed");
    expect(result.errors.some((message) => message.includes("2222"))).toBe(true);
  });
});
