import type { Asset, Quote } from "@/lib/types";
import { getQuoteCacheByAssetIds, upsertQuoteCache } from "@/lib/repository";

type FreshQuote = {
  price: number;
  quotedAt: string;
  source: string;
};

const COINGECKO_SYMBOL_TO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  XRP: "ripple",
  DOGE: "dogecoin",
};

export async function fetchQuoteForAsset(asset: Asset): Promise<FreshQuote> {
  if (asset.assetType === "equity") {
    return fetchYahooQuote(asset.symbol);
  }

  return fetchCoinGeckoQuote(asset.symbol);
}

async function fetchYahooQuote(symbol: string): Promise<FreshQuote> {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo quote failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    quoteResponse?: {
      result?: Array<{ regularMarketPrice?: number; regularMarketTime?: number }>;
    };
  };

  const quote = payload.quoteResponse?.result?.[0];
  const price = quote?.regularMarketPrice;

  if (typeof price !== "number") {
    throw new Error(`Yahoo quote missing price for ${symbol}`);
  }

  const quotedAt = quote?.regularMarketTime
    ? new Date(quote.regularMarketTime * 1000).toISOString()
    : new Date().toISOString();

  return {
    price,
    quotedAt,
    source: "yahoo",
  };
}

async function resolveCoinId(symbol: string) {
  const upper = symbol.toUpperCase();
  if (COINGECKO_SYMBOL_TO_ID[upper]) {
    return COINGECKO_SYMBOL_TO_ID[upper];
  }

  const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CoinGecko search failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    coins?: Array<{ id: string; symbol: string }>;
  };

  const exactMatch = payload.coins?.find(
    (coin) => coin.symbol.toUpperCase() === upper,
  );

  if (!exactMatch) {
    throw new Error(`CoinGecko symbol not found for ${symbol}`);
  }

  return exactMatch.id;
}

async function fetchCoinGeckoQuote(symbol: string): Promise<FreshQuote> {
  const coinId = await resolveCoinId(symbol);
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=cad&include_last_updated_at=true`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`CoinGecko quote failed (${response.status})`);
  }

  const payload = (await response.json()) as Record<
    string,
    { cad?: number; last_updated_at?: number }
  >;

  const entry = payload[coinId];
  const price = entry?.cad;

  if (typeof price !== "number") {
    throw new Error(`CoinGecko quote missing price for ${symbol}`);
  }

  const quotedAt = entry.last_updated_at
    ? new Date(entry.last_updated_at * 1000).toISOString()
    : new Date().toISOString();

  return {
    price,
    quotedAt,
    source: "coingecko",
  };
}

export async function getQuotesForAssets(assets: Asset[], refresh: boolean) {
  const cachedQuotes = getQuoteCacheByAssetIds(assets.map((asset) => asset.id));
  const warnings: string[] = [];

  if (!refresh) {
    const map = new Map<number, Quote>();
    for (const asset of assets) {
      const cached = cachedQuotes.get(asset.id);
      if (!cached) {
        continue;
      }

      map.set(asset.id, {
        assetId: asset.id,
        symbol: asset.symbol,
        assetType: asset.assetType,
        price: cached.price,
        quotedAt: cached.quoted_at,
        source: cached.source,
        stale: true,
      });
    }

    return { quotes: map, warnings };
  }

  const quotes = new Map<number, Quote>();

  await Promise.all(
    assets.map(async (asset) => {
      const cached = cachedQuotes.get(asset.id);

      try {
        const fresh = await fetchQuoteForAsset(asset);
        upsertQuoteCache({
          assetId: asset.id,
          price: fresh.price,
          quotedAt: fresh.quotedAt,
          source: fresh.source,
        });

        quotes.set(asset.id, {
          assetId: asset.id,
          symbol: asset.symbol,
          assetType: asset.assetType,
          price: fresh.price,
          quotedAt: fresh.quotedAt,
          source: fresh.source,
          stale: false,
        });
      } catch (error) {
        if (cached) {
          warnings.push(
            `Using stale quote for ${asset.symbol}: ${error instanceof Error ? error.message : "Unknown error"}`,
          );

          quotes.set(asset.id, {
            assetId: asset.id,
            symbol: asset.symbol,
            assetType: asset.assetType,
            price: cached.price,
            quotedAt: cached.quoted_at,
            source: cached.source,
            stale: true,
          });

          return;
        }

        warnings.push(
          `No quote available for ${asset.symbol}: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }),
  );

  return { quotes, warnings };
}
