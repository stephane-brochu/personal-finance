"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { formatCurrency, formatQuantity } from "@/lib/portfolio";
import type {
  Portfolio,
  PortfolioResponse,
  QuestradeSyncResult,
  YahooImportResult,
} from "@/lib/types";

async function fetchPortfolios() {
  const response = await fetch("/api/portfolios", { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error ?? "Failed to fetch portfolios");
  }

  const payload = (await response.json()) as { portfolios: Portfolio[] };
  return payload.portfolios;
}

async function fetchPortfolioSnapshot(portfolioId: number, refresh = true) {
  const response = await fetch(
    `/api/portfolio?portfolioId=${portfolioId}&refresh=${refresh ? "1" : "0"}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error ?? "Failed to fetch portfolio");
  }

  return (await response.json()) as PortfolioResponse;
}

export function PortfolioClient() {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [newPortfolioName, setNewPortfolioName] = useState("");

  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [importingYahoo, setImportingYahoo] = useState(false);
  const [syncingQuestrade, setSyncingQuestrade] = useState(false);
  const [importResult, setImportResult] = useState<YahooImportResult | null>(null);
  const [questradeSyncResult, setQuestradeSyncResult] = useState<QuestradeSyncResult | null>(null);

  async function loadPortfolios() {
    const list = await fetchPortfolios();
    setPortfolios(list);

    if (list.length === 0) {
      setSelectedPortfolioId(null);
      setPortfolio(null);
      return;
    }

    setSelectedPortfolioId((current) => current ?? list[0].id);
  }

  async function loadSnapshot(portfolioId: number, refresh = true) {
    try {
      const snapshot = await fetchPortfolioSnapshot(portfolioId, refresh);
      setPortfolio(snapshot);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load portfolio");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadPortfolios();
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load portfolios");
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedPortfolioId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void loadSnapshot(selectedPortfolioId, true);

    const interval = setInterval(() => {
      void loadSnapshot(selectedPortfolioId, true);
    }, 60_000);

    return () => clearInterval(interval);
  }, [selectedPortfolioId]);

  const quoteTimestamp = useMemo(() => {
    if (!portfolio) {
      return null;
    }

    const timestamps = portfolio.holdings
      .map((position) => position.quoteTimestamp)
      .filter(Boolean) as string[];

    return timestamps.length ? timestamps.sort().at(-1) ?? null : null;
  }, [portfolio]);

  async function handleCreatePortfolio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newPortfolioName.trim()) {
      return;
    }

    setCreatingPortfolio(true);
    setError(null);

    try {
      const response = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPortfolioName.trim() }),
      });

      const payload = (await response.json()) as Portfolio & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create portfolio");
      }

      setNewPortfolioName("");
      await loadPortfolios();
      setSelectedPortfolioId(payload.id);
      await loadSnapshot(payload.id, false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create portfolio");
    } finally {
      setCreatingPortfolio(false);
    }
  }

  async function handleYahooImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPortfolioId) {
      setError("Select or create a portfolio first");
      return;
    }

    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("yahooCsv") as HTMLInputElement | null;
    const file = fileInput?.files?.[0] ?? null;

    if (!file) {
      setError("Please select a Yahoo CSV file");
      return;
    }

    setImportingYahoo(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("portfolioId", String(selectedPortfolioId));
      formData.set("file", file);

      const response = await fetch("/api/portfolio/import-yahoo", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as YahooImportResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Import failed");
      }

      setImportResult(payload);
      form.reset();
      await loadSnapshot(selectedPortfolioId, true);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed");
    } finally {
      setImportingYahoo(false);
    }
  }

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
      await loadPortfolios();
      if (selectedPortfolioId) {
        await loadSnapshot(selectedPortfolioId, true);
      }
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Questrade sync failed");
    } finally {
      setSyncingQuestrade(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <h1>Portfolio Dashboard</h1>
          <p>Portfolio upload + holdings + trade history</p>
        </div>
        <div className="header-actions">
          <button
            className="button secondary"
            disabled={!selectedPortfolioId}
            onClick={() => selectedPortfolioId && void loadSnapshot(selectedPortfolioId, true)}
          >
            Refresh Now
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

      <section className="panel">
        <div className="panel-header">
          <h2>Select Portfolio</h2>
        </div>
        <div className="yahoo-import-form">
          <select
            value={selectedPortfolioId ?? ""}
            onChange={(event) => setSelectedPortfolioId(Number(event.target.value))}
          >
            {portfolios.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <form className="yahoo-import-form" onSubmit={handleCreatePortfolio}>
            <input
              placeholder="New portfolio name"
              value={newPortfolioName}
              onChange={(event) => setNewPortfolioName(event.target.value)}
            />
            <button className="button" type="submit" disabled={creatingPortfolio}>
              {creatingPortfolio ? "Creating..." : "Create"}
            </button>
          </form>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Upload Yahoo CSV</h2>
        </div>
        <form className="yahoo-import-form" onSubmit={handleYahooImport}>
          <label>
            Upload Yahoo CSV
            <input name="yahooCsv" type="file" accept=".csv,text/csv" required />
          </label>
          <button className="button" type="submit" disabled={importingYahoo || !selectedPortfolioId}>
            {importingYahoo ? "Importing..." : "Import"}
          </button>
        </form>
        {importResult ? (
          <p className="empty-copy">
            Parsed {importResult.counts.parsed}, inserted {importResult.counts.inserted}, deduped {" "}
            {importResult.counts.deduped}, rejected {importResult.counts.rejected}
          </p>
        ) : null}
      </section>

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

      {loading ? <p className="status">Loading portfolio...</p> : null}

      {!loading && portfolio ? (
        <>
          {portfolio.quoteWarnings.length ? (
            <div className="warning-banner">
              {portfolio.quoteWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <section className="summary-grid summary-grid-4">
            <article className="summary-card">
              <h2>Portfolio</h2>
              <p>{portfolio.portfolio.name}</p>
            </article>
            <article className="summary-card">
              <h2>Market Value</h2>
              <p>{formatCurrency(portfolio.summary.totalMarketValue)}</p>
            </article>
            <article className="summary-card">
              <h2>Imported Cash</h2>
              <p>{formatCurrency(portfolio.cash.balance)}</p>
            </article>
            <article className="summary-card">
              <h2>Unrealized P&L</h2>
              <p>{formatCurrency(portfolio.summary.totalUnrealizedPnl)}</p>
            </article>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Holdings</h2>
              <p>
                Last quote update: {quoteTimestamp ? new Date(quoteTimestamp).toLocaleString("en-CA") : "n/a"}
              </p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Avg Cost</th>
                  <th>Price</th>
                  <th>Market Value</th>
                  <th>Unrealized P&L</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.length ? (
                  portfolio.holdings.map((position) => (
                    <tr key={position.assetId}>
                      <td>{position.symbol}</td>
                      <td>{position.assetType}</td>
                      <td>{formatQuantity(position.quantity)}</td>
                      <td>{formatCurrency(position.avgCost)}</td>
                      <td>{position.marketPrice === null ? "--" : formatCurrency(position.marketPrice)}</td>
                      <td>{formatCurrency(position.marketValue)}</td>
                      <td className={position.unrealizedPnl >= 0 ? "gain" : "loss"}>
                        {formatCurrency(position.unrealizedPnl)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty-row">
                      No holdings yet. Upload a portfolio CSV.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Trade History</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Symbol</th>
                  <th>Type</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Fee</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.trades.length ? (
                  portfolio.trades.map((trade) => (
                    <tr key={trade.id}>
                      <td>{new Date(trade.tradedAt).toLocaleString("en-CA")}</td>
                      <td>{trade.symbol}</td>
                      <td>{trade.assetType}</td>
                      <td className={trade.side === "buy" ? "buy" : "sell"}>{trade.side}</td>
                      <td>{formatQuantity(trade.quantity)}</td>
                      <td>{formatCurrency(trade.price)}</td>
                      <td>{formatCurrency(trade.fee)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="empty-row">
                      No trades recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : null}
    </main>
  );
}
