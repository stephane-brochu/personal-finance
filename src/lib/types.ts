export type AssetType = "equity" | "crypto";
export type TradeSide = "buy" | "sell";
export type NetWorthEntryType = "asset" | "debt";
export type AssetCategory = "house" | "car" | "jewelry" | "cash";
export type DebtCategory = "mortgage" | "car_lease";
export type NetWorthCategory = AssetCategory | DebtCategory;

export type Asset = {
  id: number;
  symbol: string;
  assetType: AssetType;
  name: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Trade = {
  id: number;
  assetId: number;
  symbol: string;
  assetType: AssetType;
  side: TradeSide;
  quantity: number;
  price: number;
  fee: number;
  tradedAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Quote = {
  assetId: number;
  symbol: string;
  assetType: AssetType;
  price: number;
  quotedAt: string;
  source: string;
  stale: boolean;
};

export type Position = {
  assetId: number;
  symbol: string;
  assetType: AssetType;
  quantity: number;
  avgCost: number;
  costBasis: number;
  marketPrice: number | null;
  marketValue: number;
  unrealizedPnl: number;
  realizedPnl: number;
  quoteTimestamp: string | null;
  quoteStale: boolean;
};

export type PortfolioSummary = {
  baseCurrency: "CAD";
  totalMarketValue: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  updatedAt: string;
};

export type PortfolioResponse = {
  summary: PortfolioSummary;
  holdings: Position[];
  trades: Trade[];
  quoteWarnings: string[];
  netWorth: NetWorthSnapshot;
};

export type NetWorthEntry = {
  id: number;
  entryType: NetWorthEntryType;
  category: NetWorthCategory;
  label: string;
  amount: number;
  createdAt: string;
  updatedAt: string;
};

export type NetWorthCategoryGroup = {
  category: NetWorthCategory;
  total: number;
  entries: NetWorthEntry[];
};

export type NetWorthSummary = {
  baseCurrency: "CAD";
  totalAssetsManual: number;
  totalPortfolio: number;
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  updatedAt: string;
};

export type NetWorthSnapshot = {
  summary: NetWorthSummary;
  assetsByCategory: NetWorthCategoryGroup[];
  debtsByCategory: NetWorthCategoryGroup[];
};
