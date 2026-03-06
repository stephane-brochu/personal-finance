import { fetchQuoteForAsset, getQuotesForAssets } from "@/lib/quotes";

vi.mock("@/lib/repository", () => ({
  getQuoteCacheByAssetIds: vi.fn(() =>
    new Map([
      [
        1,
        {
          asset_id: 1,
          price: 99,
          quoted_at: "2026-01-01T00:00:00.000Z",
          source: "cache",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    ]),
  ),
  upsertQuoteCache: vi.fn(),
}));

describe("fetchQuoteForAsset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses Yahoo endpoint for equities", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          quoteResponse: {
            result: [{ regularMarketPrice: 101, regularMarketTime: 1735689600 }],
          },
        }),
      ),
    );

    const quote = await fetchQuoteForAsset({
      id: 10,
      symbol: "AAPL",
      assetType: "equity",
      name: null,
      createdAt: "",
      updatedAt: "",
    });

    expect(fetchMock.mock.calls[0][0]).toContain("finance.yahoo.com");
    expect(quote.price).toBe(101);
    expect(quote.source).toBe("yahoo");
  });

  it("uses CoinGecko endpoint for crypto", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bitcoin: { cad: 140000, last_updated_at: 1735689600 },
          }),
        ),
      );

    const quote = await fetchQuoteForAsset({
      id: 11,
      symbol: "BTC",
      assetType: "crypto",
      name: null,
      createdAt: "",
      updatedAt: "",
    });

    expect(fetchMock.mock.calls[0][0]).toContain("coingecko.com");
    expect(quote.price).toBe(140000);
    expect(quote.source).toBe("coingecko");
  });
});

describe("getQuotesForAssets", () => {
  it("returns stale cached quote and warning when refresh fails", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));

    const { quotes, warnings } = await getQuotesForAssets(
      [
        {
          id: 1,
          symbol: "AAPL",
          assetType: "equity",
          name: null,
          createdAt: "",
          updatedAt: "",
        },
      ],
      true,
    );

    expect(warnings[0]).toMatch(/stale quote/i);
    expect(quotes.get(1)?.stale).toBe(true);
    expect(quotes.get(1)?.price).toBe(99);
  });
});
