import type { AssetType, Position, Trade } from "@/lib/types";

const EPSILON = 1e-8;

export function normalizeSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

export type TradeLike = Pick<Trade, "id" | "side" | "quantity" | "price" | "fee" | "tradedAt">;

export type PositionCalculation = {
  quantity: number;
  avgCost: number;
  costBasis: number;
  realizedPnl: number;
};

export function calculatePositionFromTrades(trades: TradeLike[]): PositionCalculation {
  const orderedTrades = [...trades].sort((a, b) => {
    if (a.tradedAt === b.tradedAt) {
      return a.id - b.id;
    }
    return a.tradedAt.localeCompare(b.tradedAt);
  });

  let quantity = 0;
  let costBasis = 0;
  let realizedPnl = 0;

  for (const trade of orderedTrades) {
    const fee = trade.fee ?? 0;

    if (trade.side === "buy") {
      quantity += trade.quantity;
      costBasis += trade.quantity * trade.price + fee;
      continue;
    }

    if (trade.quantity - quantity > EPSILON) {
      throw new Error("Sell quantity exceeds current holdings");
    }

    const avgCost = quantity <= EPSILON ? 0 : costBasis / quantity;
    const removedCost = avgCost * trade.quantity;
    const proceeds = trade.quantity * trade.price - fee;

    quantity -= trade.quantity;
    costBasis -= removedCost;
    realizedPnl += proceeds - removedCost;

    if (Math.abs(quantity) <= EPSILON) {
      quantity = 0;
      costBasis = 0;
    }
  }

  const avgCost = quantity <= EPSILON ? 0 : costBasis / quantity;

  return {
    quantity,
    avgCost,
    costBasis,
    realizedPnl,
  };
}

export function formatCurrency(value: number, currency: "CAD" = "CAD") {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  }).format(value);
}

export function buildPosition(
  asset: { id: number; symbol: string; assetType: AssetType },
  calc: PositionCalculation,
  quote?: { price: number; quotedAt: string; stale: boolean },
): Position {
  const marketPrice = quote?.price ?? null;
  const marketValue = marketPrice === null ? 0 : calc.quantity * marketPrice;

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    assetType: asset.assetType,
    quantity: calc.quantity,
    avgCost: calc.avgCost,
    costBasis: calc.costBasis,
    marketPrice,
    marketValue,
    unrealizedPnl: marketValue - calc.costBasis,
    realizedPnl: calc.realizedPnl,
    quoteTimestamp: quote?.quotedAt ?? null,
    quoteStale: quote?.stale ?? false,
  };
}
