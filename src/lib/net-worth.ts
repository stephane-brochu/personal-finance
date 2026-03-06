import type {
  AssetCategory,
  NetWorthCategory,
  NetWorthCategoryGroup,
  NetWorthEntry,
  NetWorthSnapshot,
} from "@/lib/types";

export const ASSET_CATEGORIES: AssetCategory[] = ["house", "car", "jewelry", "cash"];
export const DEBT_CATEGORIES = ["mortgage", "car_lease"] as const;

export const CATEGORY_LABELS: Record<NetWorthCategory, string> = {
  house: "House",
  car: "Car",
  jewelry: "Jewelry",
  cash: "Cash",
  mortgage: "Mortgage",
  car_lease: "Car Lease",
};

export function isCategoryValidForEntryType(
  entryType: "asset" | "debt",
  category: NetWorthCategory,
) {
  if (entryType === "asset") {
    return (ASSET_CATEGORIES as readonly NetWorthCategory[]).includes(category);
  }

  return (DEBT_CATEGORIES as readonly NetWorthCategory[]).includes(category);
}

function buildGroups(
  categories: readonly NetWorthCategory[],
  entries: NetWorthEntry[],
): NetWorthCategoryGroup[] {
  return categories.map((category) => {
    const groupEntries = entries
      .filter((entry) => entry.category === category)
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      category,
      total: groupEntries.reduce((sum, entry) => sum + entry.amount, 0),
      entries: groupEntries,
    };
  });
}

export function buildNetWorthSnapshot(input: {
  entries: NetWorthEntry[];
  portfolioTotal: number;
  updatedAt?: string;
}): NetWorthSnapshot {
  const assets = input.entries.filter((entry) => entry.entryType === "asset");
  const debts = input.entries.filter((entry) => entry.entryType === "debt");

  const totalAssetsManual = assets.reduce((sum, entry) => sum + entry.amount, 0);
  const totalPortfolio = input.portfolioTotal;
  const totalAssets = totalAssetsManual + totalPortfolio;
  const totalDebts = debts.reduce((sum, entry) => sum + entry.amount, 0);

  return {
    summary: {
      baseCurrency: "CAD",
      totalAssetsManual,
      totalPortfolio,
      totalAssets,
      totalDebts,
      netWorth: totalAssets - totalDebts,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
    },
    assetsByCategory: buildGroups(ASSET_CATEGORIES, assets),
    debtsByCategory: buildGroups(DEBT_CATEGORIES, debts),
  };
}
