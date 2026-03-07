import { buildPosition, calculatePositionFromTrades } from "@/lib/portfolio";
import {
  getAssets,
  getPortfolioById,
  listPortfoliosByBrokerProvider,
  listCashTransactions,
  listTrades,
} from "@/lib/repository";
import { getQuotesForAssets } from "@/lib/quotes";
import type { PortfolioResponse } from "@/lib/types";

function shouldUseTradeForHoldings(source: string) {
  return source !== "questrade_activity";
}

function shouldUseCashForBalance(source: string) {
  return source !== "questrade_activity";
}

function getTorontoDateKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function warnOnNonTodayQuotes(holdings: PortfolioResponse["holdings"]) {
  const todayKey = getTorontoDateKey(new Date().toISOString());
  const warnings: string[] = [];

  for (const holding of holdings) {
    if (!holding.quoteTimestamp) {
      warnings.push(`No quote timestamp available for ${holding.symbol}`);
      continue;
    }

    if (getTorontoDateKey(holding.quoteTimestamp) !== todayKey) {
      warnings.push(`Using non-today quote for ${holding.symbol}`);
    }
  }

  return warnings;
}

export async function getPortfolioSnapshot(
  portfolioId: number,
  refreshQuotes: boolean,
): Promise<PortfolioResponse> {
  const portfolio = getPortfolioById(portfolioId);
  if (!portfolio) {
    throw new Error("Portfolio not found");
  }

  const assets = getAssets(portfolioId);
  const trades = listTrades(portfolioId);
  const valuationTrades = trades.filter((trade) => shouldUseTradeForHoldings(trade.source));
  const tradesByAsset = new Map<number, typeof trades>();

  for (const trade of valuationTrades) {
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

  const cashTransactions = listCashTransactions(portfolioId);
  const balanceTransactions = cashTransactions.filter((item) => shouldUseCashForBalance(item.source));
  const cash = {
    balance: balanceTransactions.reduce((sum, item) => sum + item.amount, 0),
    totalDeposits: balanceTransactions
      .filter((item) => item.transactionType === "deposit")
      .reduce((sum, item) => sum + item.amount, 0),
    totalWithdrawals: Math.abs(
      balanceTransactions
        .filter((item) => item.transactionType === "withdrawal")
        .reduce((sum, item) => sum + item.amount, 0),
    ),
    transactionCount: balanceTransactions.length,
  };

  return {
    portfolio,
    summary,
    cash,
    holdings,
    trades,
    quoteWarnings: [...warnings, ...warnOnNonTodayQuotes(holdings)],
  };
}

export async function getBrokerPortfolioSnapshots(
  provider: "questrade",
  refreshQuotes: boolean,
): Promise<PortfolioResponse[]> {
  const portfolios = listPortfoliosByBrokerProvider(provider);
  const snapshots = await Promise.all(
    portfolios.map((portfolio) => getPortfolioSnapshot(portfolio.id, refreshQuotes)),
  );

  return snapshots.sort((left, right) => {
    const leftAccount = left.portfolio.brokerAccountNumber ?? left.portfolio.name;
    const rightAccount = right.portfolio.brokerAccountNumber ?? right.portfolio.name;
    return leftAccount.localeCompare(rightAccount);
  });
}
