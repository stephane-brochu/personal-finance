import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortfolioClient } from "@/components/portfolio-client";

const baseSnapshot = {
  portfolio: { id: 1, name: "Main", createdAt: "", updatedAt: "" },
  summary: {
    baseCurrency: "CAD",
    totalMarketValue: 100,
    totalUnrealizedPnl: 10,
    totalRealizedPnl: 2,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  cash: {
    balance: 50,
    totalDeposits: 100,
    totalWithdrawals: 50,
    transactionCount: 2,
  },
  holdings: [
    {
      assetId: 1,
      symbol: "VDY.TO",
      assetType: "equity",
      quantity: 10,
      avgCost: 50,
      costBasis: 500,
      marketPrice: 65,
      marketValue: 650,
      unrealizedPnl: 150,
      realizedPnl: 0,
      quoteTimestamp: "2026-01-01T00:00:00.000Z",
      quoteStale: false,
    },
  ],
  trades: [
    {
      id: 1,
      portfolioId: 1,
      assetId: 1,
      symbol: "VDY.TO",
      assetType: "equity",
      side: "buy",
      quantity: 10,
      price: 50,
      fee: 0,
      tradedAt: "2026-01-01T00:00:00.000Z",
      notes: null,
      createdAt: "",
      updatedAt: "",
    },
  ],
  quoteWarnings: [],
};

describe("PortfolioClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads portfolios and selected snapshot", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ portfolios: [{ id: 1, name: "Main" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify(baseSnapshot)));

    render(<PortfolioClient />);

    await screen.findByText("Portfolio Dashboard");
    const symbols = await screen.findAllByText("VDY.TO");
    expect(symbols.length).toBeGreaterThan(0);
  });

  it("creates a portfolio", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ portfolios: [{ id: 1, name: "Main" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify(baseSnapshot)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 2, name: "RRSP", createdAt: "", updatedAt: "" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ portfolios: [{ id: 1, name: "Main" }, { id: 2, name: "RRSP" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...baseSnapshot, portfolio: { id: 2, name: "RRSP", createdAt: "", updatedAt: "" } })));

    render(<PortfolioClient />);

    await screen.findAllByText("VDY.TO");
    fireEvent.change(screen.getByPlaceholderText(/new portfolio name/i), {
      target: { value: "RRSP" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/portfolios",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("uploads yahoo csv for selected portfolio", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ portfolios: [{ id: 1, name: "Main" }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify(baseSnapshot)))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            counts: { parsed: 2, inserted: 2, deduped: 0, rejected: 0 },
            warnings: [],
            errors: [],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(baseSnapshot)));

    render(<PortfolioClient />);

    await screen.findAllByText("VDY.TO");

    const fileInput = document.querySelector("input[name='yahooCsv']") as HTMLInputElement | null;
    if (!fileInput) {
      throw new Error("File input not found");
    }
    const file = new File(["Symbol,Trade Date,Purchase Price,Quantity,Commission"], "portfolio.csv", {
      type: "text/csv",
    });
    Object.defineProperty(fileInput, "files", {
      value: [file],
      writable: false,
    });

    const uploadForm = fileInput.closest("form");
    if (!uploadForm) {
      throw new Error("Upload form not found");
    }
    fireEvent.submit(uploadForm);

    await waitFor(() => {
      const hasImportCall = fetchMock.mock.calls.some(
        (call) => call[0] === "/api/portfolio/import-yahoo",
      );
      expect(hasImportCall).toBe(true);
    });
  });
});
