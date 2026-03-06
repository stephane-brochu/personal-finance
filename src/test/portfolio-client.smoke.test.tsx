import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PortfolioClient } from "@/components/portfolio-client";

const initialPortfolio = {
  summary: {
    baseCurrency: "CAD",
    totalMarketValue: 0,
    totalUnrealizedPnl: 0,
    totalRealizedPnl: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  holdings: [],
  trades: [],
  quoteWarnings: [],
  netWorth: {
    summary: {
      baseCurrency: "CAD",
      totalAssetsManual: 0,
      totalPortfolio: 0,
      totalAssets: 0,
      totalDebts: 0,
      netWorth: 0,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    assetsByCategory: [
      { category: "house", total: 0, entries: [] },
      { category: "car", total: 0, entries: [] },
      { category: "jewelry", total: 0, entries: [] },
      { category: "cash", total: 0, entries: [] },
    ],
    debtsByCategory: [
      { category: "mortgage", total: 0, entries: [] },
      { category: "car_lease", total: 0, entries: [] },
    ],
  },
};

const withTradePortfolio = {
  summary: {
    baseCurrency: "CAD",
    totalMarketValue: 100,
    totalUnrealizedPnl: 10,
    totalRealizedPnl: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  holdings: [
    {
      assetId: 1,
      symbol: "AAPL",
      assetType: "equity",
      quantity: 1,
      avgCost: 90,
      costBasis: 90,
      marketPrice: 100,
      marketValue: 100,
      unrealizedPnl: 10,
      realizedPnl: 0,
      quoteTimestamp: "2026-01-01T00:00:00.000Z",
      quoteStale: false,
    },
  ],
  trades: [
    {
      id: 2,
      assetId: 1,
      symbol: "AAPL",
      assetType: "equity",
      side: "buy",
      quantity: 1,
      price: 90,
      fee: 0,
      tradedAt: "2026-01-01T00:00:00.000Z",
      notes: null,
      createdAt: "",
      updatedAt: "",
    },
  ],
  quoteWarnings: [],
  netWorth: {
    summary: {
      baseCurrency: "CAD",
      totalAssetsManual: 2000,
      totalPortfolio: 100,
      totalAssets: 2100,
      totalDebts: 1200,
      netWorth: 900,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    assetsByCategory: [
      {
        category: "house",
        total: 0,
        entries: [],
      },
      {
        category: "car",
        total: 0,
        entries: [],
      },
      {
        category: "jewelry",
        total: 0,
        entries: [],
      },
      {
        category: "cash",
        total: 2000,
        entries: [
          {
            id: 11,
            entryType: "asset",
            category: "cash",
            label: "Checking",
            amount: 2000,
            createdAt: "",
            updatedAt: "",
          },
        ],
      },
    ],
    debtsByCategory: [
      {
        category: "mortgage",
        total: 1000,
        entries: [
          {
            id: 22,
            entryType: "debt",
            category: "mortgage",
            label: "Primary Mortgage",
            amount: 1000,
            createdAt: "",
            updatedAt: "",
          },
        ],
      },
      {
        category: "car_lease",
        total: 200,
        entries: [
          {
            id: 23,
            entryType: "debt",
            category: "car_lease",
            label: "Car Lease",
            amount: 200,
            createdAt: "",
            updatedAt: "",
          },
        ],
      },
    ],
  },
};

describe("PortfolioClient smoke", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("adds a trade and refreshes data", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(initialPortfolio)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1 }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(withTradePortfolio)));

    render(<PortfolioClient />);

    await screen.findByText(/No trades recorded/i);
    fireEvent.click(screen.getByRole("button", { name: /add trade/i }));

    fireEvent.change(screen.getByLabelText(/symbol/i), { target: { value: "aapl" } });
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText(/^price$/i), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: /save trade/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trades",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const symbols = await screen.findAllByText("AAPL");
    expect(symbols.length).toBeGreaterThan(0);
  });

  it("edits and deletes a trade", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(withTradePortfolio)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 2 })))
      .mockResolvedValueOnce(new Response(JSON.stringify(withTradePortfolio)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify(initialPortfolio)))
      .mockResolvedValueOnce(new Response(JSON.stringify(initialPortfolio)));

    render(<PortfolioClient />);

    const symbols = await screen.findAllByText("AAPL");
    expect(symbols.length).toBeGreaterThan(0);

    const tradeHistoryHeading = screen.getByRole("heading", { name: /trade history/i });
    const tradeSection = tradeHistoryHeading.closest("section");
    if (!tradeSection) {
      throw new Error("Could not locate trade history section");
    }
    fireEvent.click(within(tradeSection).getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText(/fee/i), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /save trade/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trades/2",
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/trades/2",
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });

  it("auto refreshes every 60 seconds and supports manual refresh", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify(initialPortfolio));
    });

    const { unmount } = render(<PortfolioClient />);
    await screen.findByText(/No trades recorded/i);

    fireEvent.click(screen.getByRole("button", { name: /refresh now/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    const intervalCallback = setIntervalSpy.mock.calls[0]?.[0] as (() => void) | undefined;
    intervalCallback?.();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    unmount();
  });

  it("adds and edits net worth entries", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(initialPortfolio)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 55 }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(withTradePortfolio)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 22 })))
      .mockResolvedValueOnce(new Response(JSON.stringify(withTradePortfolio)));

    render(<PortfolioClient />);
    await screen.findByText(/No trades recorded/i);

    fireEvent.click(screen.getAllByRole("button", { name: /add item/i })[0]);
    fireEvent.change(screen.getByLabelText(/^label$/i), { target: { value: "Condo" } });
    fireEvent.change(screen.getByLabelText(/^amount$/i), { target: { value: "500000" } });
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/net-worth/entries",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const mortgageText = await screen.findByText(/Primary Mortgage/i);
    const mortgageRow = mortgageText.closest("li");
    if (!mortgageRow) {
      throw new Error("Could not locate mortgage row");
    }
    fireEvent.click(within(mortgageRow).getByRole("button", { name: /^edit$/i }));
    fireEvent.change(screen.getByLabelText(/^label$/i), {
      target: { value: "Updated Mortgage" },
    });
    fireEvent.change(screen.getByLabelText(/^amount$/i), { target: { value: "850" } });
    fireEvent.click(screen.getByRole("button", { name: /save entry/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/net-worth/entries/22",
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });
});
