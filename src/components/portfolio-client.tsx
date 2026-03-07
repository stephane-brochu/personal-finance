"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency, formatQuantity } from "@/lib/portfolio";
import type {
  PortfolioAccountsResponse,
  PortfolioResponse,
  QuestradeSyncResult,
} from "@/lib/types";

async function fetchAccountPortfolios(refresh = true) {
  const response = await fetch(
    `/api/portfolio/accounts?provider=questrade&refresh=${refresh ? "1" : "0"}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error ?? "Failed to fetch account portfolios");
  }

  return (await response.json()) as PortfolioAccountsResponse;
}

function getLatestQuoteTimestamp(portfolio: PortfolioResponse) {
  const timestamps = portfolio.holdings
    .map((position) => position.quoteTimestamp)
    .filter(Boolean) as string[];

  return timestamps.length ? timestamps.sort().at(-1) ?? null : null;
}

export function PortfolioClient() {
  const [portfolios, setPortfolios] = useState<PortfolioResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingQuestrade, setSyncingQuestrade] = useState(false);
  const [questradeSyncResult, setQuestradeSyncResult] = useState<QuestradeSyncResult | null>(null);

  async function loadAccountPortfolios(refresh = true) {
    try {
      const payload = await fetchAccountPortfolios(refresh);
      setPortfolios(payload.portfolios);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load account portfolios",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccountPortfolios(true);

    const interval = setInterval(() => {
      void loadAccountPortfolios(true);
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  async function handleQuestradeSync() {
    setSyncingQuestrade(true);
    setError(null);

    try {
      const response = await fetch("/api/brokers/questrade/sync", {
        method: "POST",
      });
      const payload = (await response.json()) as QuestradeSyncResult & { error?: string };

      if (!response.ok && !payload.counts) {
        throw new Error(payload.error ?? "Questrade sync failed");
      }

      setQuestradeSyncResult(payload);
      await loadAccountPortfolios(true);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Questrade sync failed");
    } finally {
      setSyncingQuestrade(false);
    }
  }

  const portfolioCountLabel = useMemo(() => {
    return portfolios.length === 1 ? "1 account portfolio" : `${portfolios.length} account portfolios`;
  }, [portfolios]);

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <h1>Account Portfolios</h1>
          <p>Questrade account holdings with today-first pricing</p>
        </div>
        <div className="header-actions">
          <button className="button secondary" onClick={() => void loadAccountPortfolios(true)}>
            Refresh Prices
          </button>
          <button
            className="button"
            disabled={syncingQuestrade}
            onClick={() => void handleQuestradeSync()}
          >
            {syncingQuestrade ? "Syncing Questrade..." : "Sync Questrade Accounts"}
          </button>
        </div>
      </header>

      {error ? <p className="error-banner">{error}</p> : null}

      {questradeSyncResult ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Questrade Sync Result</h2>
            <p>{new Date(questradeSyncResult.syncedAt).toLocaleString("en-CA")}</p>
          </div>
          <p className="empty-copy">
            Parsed {questradeSyncResult.counts.parsed}, inserted {questradeSyncResult.counts.inserted},
            deduped {questradeSyncResult.counts.deduped}, rejected {questradeSyncResult.counts.rejected}
          </p>
          {questradeSyncResult.accounts.map((account) => (
            <p className="empty-copy" key={account.accountNumber}>
              {account.accountNumber}: {account.status} ({account.counts.inserted} inserted,{" "}
              {account.counts.deduped} deduped, {account.counts.rejected} rejected)
            </p>
          ))}
          {questradeSyncResult.warnings.length ? (
            <div className="warning-banner">
              {questradeSyncResult.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {loading ? <p className="status">Loading account portfolios...</p> : null}

      {!loading ? (
        <>
          <section className="summary-grid summary-grid-4">
            <article className="summary-card">
              <h2>Accounts</h2>
              <p>{portfolioCountLabel}</p>
            </article>
            <article className="summary-card">
              <h2>Total Market Value</h2>
              <p>
                {formatCurrency(
                  portfolios.reduce(
                    (sum, portfolio) => sum + portfolio.summary.totalMarketValue,
                    0,
                  ),
                )}
              </p>
            </article>
            <article className="summary-card">
              <h2>Total Cash</h2>
              <p>
                {formatCurrency(
                  portfolios.reduce((sum, portfolio) => sum + portfolio.cash.balance, 0),
                )}
              </p>
            </article>
            <article className="summary-card">
              <h2>Total Unrealized P&amp;L</h2>
              <p>
                {formatCurrency(
                  portfolios.reduce(
                    (sum, portfolio) => sum + portfolio.summary.totalUnrealizedPnl,
                    0,
                  ),
                )}
              </p>
            </article>
          </section>

          {portfolios.length ? (
            portfolios.map((portfolio) => {
              const quoteTimestamp = getLatestQuoteTimestamp(portfolio);
              return (
                <section className="panel" key={portfolio.portfolio.id}>
                  <div className="panel-header">
                    <div>
                      <h2>{portfolio.portfolio.name}</h2>
                      <p>
                        Account {portfolio.portfolio.brokerAccountNumber ?? "n/a"} | Cash{" "}
                        {formatCurrency(portfolio.cash.balance)} | Market Value{" "}
                        {formatCurrency(portfolio.summary.totalMarketValue)}
                      </p>
                    </div>
                    <p>
                      Last quote update:{" "}
                      {quoteTimestamp ? new Date(quoteTimestamp).toLocaleString("en-CA") : "n/a"}
                    </p>
                  </div>

                  {portfolio.quoteWarnings.length ? (
                    <div className="warning-banner">
                      {portfolio.quoteWarnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  ) : null}

                  <table>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Type</th>
                        <th>Qty</th>
                        <th>Avg Cost</th>
                        <th>Price</th>
                        <th>Market Value</th>
                        <th>Unrealized P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.holdings.length ? (
                        portfolio.holdings.map((position) => (
                          <tr key={`${portfolio.portfolio.id}-${position.assetId}`}>
                            <td>{position.symbol}</td>
                            <td>{position.assetType}</td>
                            <td>{formatQuantity(position.quantity)}</td>
                            <td>{formatCurrency(position.avgCost)}</td>
                            <td>
                              {position.marketPrice === null ? "--" : formatCurrency(position.marketPrice)}
                            </td>
                            <td>{formatCurrency(position.marketValue)}</td>
                            <td className={position.unrealizedPnl >= 0 ? "gain" : "loss"}>
                              {formatCurrency(position.unrealizedPnl)}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="empty-row">
                            No holdings in this account.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </section>
              );
            })
          ) : (
            <section className="panel">
              <div className="panel-header">
                <h2>No Questrade Account Portfolios</h2>
              </div>
              <p className="empty-copy">
                Sync Questrade accounts to create one portfolio per broker account.
              </p>
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
