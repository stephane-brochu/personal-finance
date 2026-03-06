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

export type AccountType = "brokerage" | "bank";
export type StatementFormat = "pdf" | "csv";
export type StatementIngestStatus = "processing" | "completed" | "failed";
export type StatementRowStatus = "inserted" | "deduped" | "rejected";
export type CashTransactionType =
  | "deposit"
  | "withdrawal"
  | "dividend"
  | "interest"
  | "fee"
  | "transfer";

export type Account = {
  id: number;
  institution: string;
  accountMask: string;
  accountHash: string;
  accountType: AccountType;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type Statement = {
  id: number;
  accountId: number;
  institution: string;
  accountMask: string;
  accountType: AccountType;
  currency: string;
  fileName: string;
  filePath: string;
  format: StatementFormat;
  sha256: string;
  periodStart: string | null;
  periodEnd: string | null;
  parserId: string;
  parserVersion: string;
  status: StatementIngestStatus;
  errorSummary: string | null;
  warnings: string[];
  parsedCount: number;
  insertedCount: number;
  dedupedCount: number;
  rejectedCount: number;
  reprocessOfStatementId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type StatementRow = {
  id: number;
  statementId: number;
  accountId: number;
  rowIndex: number;
  recordType: "trade" | "cash_movement";
  fingerprint: string;
  status: StatementRowStatus;
  sourceRef: string | null;
  symbol: string | null;
  side: TradeSide | null;
  quantity: number | null;
  price: number | null;
  fee: number | null;
  amount: number | null;
  currency: string;
  occurredAt: string;
  description: string | null;
  reference: string | null;
  rawData: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type CashTransaction = {
  id: number;
  accountId: number;
  statementRowId: number;
  transactionType: CashTransactionType;
  amount: number;
  currency: string;
  occurredAt: string;
  description: string | null;
  reference: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NormalizedTradeRecord = {
  recordType: "trade";
  sourceRef?: string | null;
  tradedAt: string;
  symbol: string;
  assetType: AssetType;
  side: TradeSide;
  quantity: number;
  price: number;
  fee: number;
  currency: string;
  description?: string | null;
  reference?: string | null;
  raw?: Record<string, unknown>;
};

export type NormalizedCashMovementRecord = {
  recordType: "cash_movement";
  sourceRef?: string | null;
  occurredAt: string;
  transactionType: CashTransactionType;
  amount: number;
  currency: string;
  description?: string | null;
  reference?: string | null;
  raw?: Record<string, unknown>;
};

export type NormalizedStatementRecord =
  | NormalizedTradeRecord
  | NormalizedCashMovementRecord;

export type StatementIngestCounts = {
  parsed: number;
  inserted: number;
  deduped: number;
  rejected: number;
};

export type StatementIngestResult = {
  statement: Statement;
  counts: StatementIngestCounts;
  warnings: string[];
  errors: string[];
};

export type StatementParserContext = {
  institution: string;
  accountType: AccountType;
  currency: string;
  fileName: string;
  format: StatementFormat;
};

export type StatementParseResult = {
  periodStart: string | null;
  periodEnd: string | null;
  records: NormalizedStatementRecord[];
  warnings: string[];
};

export interface ParserAdapter {
  id: string;
  version: string;
  institution: string;
  formats: StatementFormat[];
  canParse(context: StatementParserContext): boolean;
  parse(input: {
    text: string;
    fileName: string;
    context: StatementParserContext;
  }): StatementParseResult;
}
