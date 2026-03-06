import { buildNetWorthSnapshot } from "@/lib/net-worth";
import { netWorthEntryCreateSchema } from "@/lib/validation";

describe("buildNetWorthSnapshot", () => {
  it("aggregates net worth with multiple entries and portfolio value", () => {
    const snapshot = buildNetWorthSnapshot({
      entries: [
        {
          id: 1,
          entryType: "asset",
          category: "house",
          label: "Primary Home",
          amount: 600000,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: 2,
          entryType: "asset",
          category: "cash",
          label: "Checking",
          amount: 15000,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: 3,
          entryType: "debt",
          category: "mortgage",
          label: "Mortgage",
          amount: 300000,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: 4,
          entryType: "debt",
          category: "car_lease",
          label: "Car Lease",
          amount: 20000,
          createdAt: "",
          updatedAt: "",
        },
      ],
      portfolioTotal: 20000,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(snapshot.summary.totalAssetsManual).toBe(615000);
    expect(snapshot.summary.totalPortfolio).toBe(20000);
    expect(snapshot.summary.totalAssets).toBe(635000);
    expect(snapshot.summary.totalDebts).toBe(320000);
    expect(snapshot.summary.netWorth).toBe(315000);

    const houseGroup = snapshot.assetsByCategory.find((group) => group.category === "house");
    expect(houseGroup?.total).toBe(600000);

    const mortgageGroup = snapshot.debtsByCategory.find(
      (group) => group.category === "mortgage",
    );
    expect(mortgageGroup?.total).toBe(300000);
  });
});

describe("netWorthEntryCreateSchema", () => {
  it("accepts valid category for entry type", () => {
    const parsed = netWorthEntryCreateSchema.parse({
      entryType: "asset",
      category: "car",
      label: "Family Car",
      amount: 10000,
    });

    expect(parsed.category).toBe("car");
  });

  it("rejects invalid category for entry type", () => {
    expect(() =>
      netWorthEntryCreateSchema.parse({
        entryType: "debt",
        category: "house",
        label: "Bad",
        amount: 1,
      }),
    ).toThrow(/category is not valid/i);
  });

  it("rejects negative amount", () => {
    expect(() =>
      netWorthEntryCreateSchema.parse({
        entryType: "asset",
        category: "cash",
        label: "Wallet",
        amount: -10,
      }),
    ).toThrow(/0 or greater/i);
  });
});
