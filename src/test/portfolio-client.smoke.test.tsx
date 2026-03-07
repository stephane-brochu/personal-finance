import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortfolioClient } from "@/components/portfolio-client";

const makeSnapshot = (id: number, name: string, accountNumber: string, quoteWarnings: string[] = []) => ({
  portfolio: {
    id,
    name,
    brokerProvider: "questrade",
    brokerAccountNumber: accountNumber,
    createdAt: "",
    updatedAt: "",
  },
  summary: {
    baseCurrency: "CAD",
    totalMarketValue: 650,
    totalUnrealizedPnl: 150,
    totalRealizedPnl: 2,
    updatedAt: "2026-03-06T16:00:00.000Z",
  },
  cash: {
    balance: 50,
    totalDeposits: 100,
    totalWithdrawals: 50,
    transactionCount: 2,
  },
  holdings: [
    {
      assetId: id,
      symbol: "VDY.TO",
      assetType: "equity",
      quantity: 10,
      avgCost: 50,
      costBasis: 500,
      marketPrice: 65,
      marketValue: 650,
      unrealizedPnl: 150,
      realizedPnl: 0,
      quoteTimestamp: "2026-03-06T16:00:00.000Z",
      quoteStale: false,
    },
  ],
  trades: [],
  quoteWarnings,
});

describe("PortfolioClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads and renders all questrade account portfolios", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          portfolios: [
            makeSnapshot(1, "Questrade 53308664", "53308664"),
            makeSnapshot(2, "Questrade 53646523", "53646523"),
          ],
        }),
      ),
    );

    render(<PortfolioClient />);

    await screen.findByText("Account Portfolios");
    expect(await screen.findByText("Questrade 53308664")).toBeInTheDocument();
    expect(await screen.findByText("Questrade 53646523")).toBeInTheDocument();
    expect(screen.getByText("2 account portfolios")).toBeInTheDocument();
  });

  it("shows quote warnings for non-today or stale quotes", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          portfolios: [
            makeSnapshot(1, "Questrade 53308664", "53308664", [
              "Using non-today quote for VDY.TO",
            ]),
          ],
        }),
      ),
    );

    render(<PortfolioClient />);

    expect(await screen.findByText(/Using non-today quote/i)).toBeInTheDocument();
  });

  it("syncs questrade accounts and refreshes the account portfolio list", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            portfolios: [makeSnapshot(1, "Questrade 53308664", "53308664")],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            provider: "questrade",
            counts: { parsed: 3, inserted: 3, deduped: 0, rejected: 0 },
            accounts: [
              {
                accountNumber: "53308664",
                portfolioId: 1,
                portfolioName: "Questrade 53308664",
                status: "ok",
                counts: { parsed: 3, inserted: 3, deduped: 0, rejected: 0 },
                warnings: [],
                errors: [],
              },
            ],
            warnings: [],
            errors: [],
            syncedAt: "2026-03-06T23:00:00.000Z",
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            portfolios: [
              makeSnapshot(1, "Questrade 53308664", "53308664"),
              makeSnapshot(2, "Questrade 53646523", "53646523"),
            ],
          }),
        ),
      );

    render(<PortfolioClient />);

    await screen.findByText("Questrade 53308664");
    fireEvent.click(screen.getByRole("button", { name: /sync questrade accounts/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/brokers/questrade/sync",
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(await screen.findByText("Questrade 53646523")).toBeInTheDocument();
  });
});
