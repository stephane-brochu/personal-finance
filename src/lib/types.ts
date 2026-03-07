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
  portfolioId: number;
  assetId: number;
  symbol: string;
  assetType: AssetType;
  source: string;
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
  portfolio: Portfolio;
  summary: PortfolioSummary;
  cash: PortfolioCashSummary;
  holdings: Position[];
  trades: Trade[];
  quoteWarnings: string[];
};

export type Portfolio = {
  id: number;
  name: string;
  brokerProvider?: BrokerProvider | null;
  brokerAccountNumber?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioAccountsResponse = {
  portfolios: PortfolioResponse[];
};

export type BrokerProvider = "questrade";
export type BrokerSyncStatus = "never" | "ok" | "partial" | "failed";

export type BrokerAccount = {
  id: number;
  provider: BrokerProvider;
  brokerAccountNumber: string;
  portfolioId: number;
  lastSyncedAt: string | null;
  syncStatus: BrokerSyncStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
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
export type CashTransactionType = "deposit" | "withdrawal";

export type CashTransaction = {
  id: number;
  portfolioId: number;
  transactionType: CashTransactionType;
  amount: number;
  occurredAt: string;
  source: string;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioCashSummary = {
  balance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  transactionCount: number;
};

export type YahooImportCounts = {
  parsed: number;
  inserted: number;
  deduped: number;
  rejected: number;
};

export type YahooImportResult = {
  counts: YahooImportCounts;
  warnings: string[];
  errors: string[];
};

export type BrokerSyncCounts = {
  parsed: number;
  inserted: number;
  deduped: number;
  rejected: number;
};

export type BrokerAccountSyncResult = {
  accountNumber: string;
  portfolioId: number;
  portfolioName: string;
  status: "ok" | "partial" | "failed";
  counts: BrokerSyncCounts;
  warnings: string[];
  errors: string[];
};

export type QuestradeSyncResult = {
  provider: "questrade";
  counts: BrokerSyncCounts;
  accounts: BrokerAccountSyncResult[];
  warnings: string[];
  errors: string[];
  syncedAt: string;
};
