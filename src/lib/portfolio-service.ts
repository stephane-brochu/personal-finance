import { buildNetWorthSnapshot } from "@/lib/net-worth";
import { buildPosition, calculatePositionFromTrades } from "@/lib/portfolio";
import { getAssets, listNetWorthEntries, listTrades } from "@/lib/repository";
import { getQuotesForAssets } from "@/lib/quotes";
import type { PortfolioResponse } from "@/lib/types";

export async function getPortfolioSnapshot(refreshQuotes: boolean): Promise<PortfolioResponse> {
  const assets = getAssets();
  const trades = listTrades();
  const tradesByAsset = new Map<number, typeof trades>();

  for (const trade of trades) {
    const current = tradesByAsset.get(trade.assetId) ?? [];
    current.push(trade);
    tradesByAsset.set(trade.assetId, current);
  }

  const { quotes, warnings } = await getQuotesForAssets(assets, refreshQuotes);

  const holdings = assets
    .map((asset) => {
      const assetTrades = tradesByAsset.get(asset.id) ?? [];
      const calc = calculatePositionFromTrades(
        assetTrades.map((trade) => ({
          id: trade.id,
          side: trade.side,
          quantity: trade.quantity,
          price: trade.price,
          fee: trade.fee,
          tradedAt: trade.tradedAt,
        })),
      );

      return buildPosition(asset, calc, quotes.get(asset.id));
    })
    .filter((position) => position.quantity > 0)
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const summary = {
    baseCurrency: "CAD" as const,
    totalMarketValue: holdings.reduce((sum, position) => sum + position.marketValue, 0),
    totalUnrealizedPnl: holdings.reduce(
      (sum, position) => sum + position.unrealizedPnl,
      0,
    ),
    totalRealizedPnl: assets.reduce((sum, asset) => {
      const assetTrades = tradesByAsset.get(asset.id) ?? [];
      const calc = calculatePositionFromTrades(
        assetTrades.map((trade) => ({
          id: trade.id,
          side: trade.side,
          quantity: trade.quantity,
          price: trade.price,
          fee: trade.fee,
          tradedAt: trade.tradedAt,
        })),
      );

      return sum + calc.realizedPnl;
    }, 0),
    updatedAt: new Date().toISOString(),
  };

  const netWorth = buildNetWorthSnapshot({
    entries: listNetWorthEntries(),
    portfolioTotal: summary.totalMarketValue,
    updatedAt: summary.updatedAt,
  });

  return {
    summary,
    holdings,
    trades,
    quoteWarnings: warnings,
    netWorth,
  };
}
