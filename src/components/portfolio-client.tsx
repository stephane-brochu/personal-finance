"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ASSET_CATEGORIES, CATEGORY_LABELS, DEBT_CATEGORIES } from "@/lib/net-worth";
import { formatCurrency, formatQuantity } from "@/lib/portfolio";
import type {
  AssetType,
  DebtCategory,
  NetWorthCategory,
  NetWorthEntry,
  NetWorthEntryType,
  PortfolioResponse,
  Trade,
  TradeSide,
} from "@/lib/types";

type TradeFormState = {
  symbol: string;
  assetType: AssetType;
  side: TradeSide;
  quantity: string;
  price: string;
  fee: string;
  tradedAt: string;
  notes: string;
};

type NetWorthFormState = {
  entryType: NetWorthEntryType;
  category: NetWorthCategory;
  label: string;
  amount: string;
};

const DEFAULT_TRADE_FORM: TradeFormState = {
  symbol: "",
  assetType: "equity",
  side: "buy",
  quantity: "",
  price: "",
  fee: "0",
  tradedAt: new Date().toISOString().slice(0, 16),
  notes: "",
};

const DEFAULT_NET_WORTH_FORM: NetWorthFormState = {
  entryType: "asset",
  category: ASSET_CATEGORIES[0],
  label: "",
  amount: "",
};

function toTradeFormState(trade: Trade): TradeFormState {
  return {
    symbol: trade.symbol,
    assetType: trade.assetType,
    side: trade.side,
    quantity: String(trade.quantity),
    price: String(trade.price),
    fee: String(trade.fee),
    tradedAt: trade.tradedAt.slice(0, 16),
    notes: trade.notes ?? "",
  };
}

function toNetWorthFormState(entry: NetWorthEntry): NetWorthFormState {
  return {
    entryType: entry.entryType,
    category: entry.category,
    label: entry.label,
    amount: String(entry.amount),
  };
}

async function fetchPortfolio(refresh = true) {
  const response = await fetch(`/api/portfolio?refresh=${refresh ? "1" : "0"}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error ?? "Failed to fetch portfolio");
  }

  return (await response.json()) as PortfolioResponse;
}

function categoriesForEntryType(entryType: NetWorthEntryType): NetWorthCategory[] {
  if (entryType === "asset") {
    return [...ASSET_CATEGORIES];
  }

  return [...DEBT_CATEGORIES] as NetWorthCategory[];
}

export function PortfolioClient() {
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [submittingTrade, setSubmittingTrade] = useState(false);
  const [tradeFormError, setTradeFormError] = useState<string | null>(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [tradeFormState, setTradeFormState] = useState<TradeFormState>(DEFAULT_TRADE_FORM);

  const [submittingNetWorth, setSubmittingNetWorth] = useState(false);
  const [netWorthFormError, setNetWorthFormError] = useState<string | null>(null);
  const [showNetWorthModal, setShowNetWorthModal] = useState(false);
  const [editingNetWorthEntry, setEditingNetWorthEntry] = useState<NetWorthEntry | null>(null);
  const [netWorthFormState, setNetWorthFormState] =
    useState<NetWorthFormState>(DEFAULT_NET_WORTH_FORM);

  async function loadData(refresh = true) {
    try {
      const data = await fetchPortfolio(refresh);
      setPortfolio(data);
      setLoadingError(null);
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(true);

    const interval = setInterval(() => {
      void loadData(true);
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  const quoteTimestamp = useMemo(() => {
    if (!portfolio) {
      return null;
    }

    const timestamps = portfolio.holdings
      .map((position) => position.quoteTimestamp)
      .filter(Boolean) as string[];

    if (timestamps.length === 0) {
      return null;
    }

    return timestamps.sort().at(-1) ?? null;
  }, [portfolio]);

  function openAddTradeModal() {
    setEditingTrade(null);
    setTradeFormState({ ...DEFAULT_TRADE_FORM, tradedAt: new Date().toISOString().slice(0, 16) });
    setTradeFormError(null);
    setShowTradeModal(true);
  }

  function openEditTradeModal(trade: Trade) {
    setEditingTrade(trade);
    setTradeFormState(toTradeFormState(trade));
    setTradeFormError(null);
    setShowTradeModal(true);
  }

  function closeTradeModal() {
    setShowTradeModal(false);
    setEditingTrade(null);
    setTradeFormState(DEFAULT_TRADE_FORM);
    setTradeFormError(null);
  }

  async function handleTradeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingTrade(true);
    setTradeFormError(null);

    const payload = {
      symbol: tradeFormState.symbol.trim().toUpperCase(),
      assetType: tradeFormState.assetType,
      side: tradeFormState.side,
      quantity: Number(tradeFormState.quantity),
      price: Number(tradeFormState.price),
      fee: Number(tradeFormState.fee || "0"),
      tradedAt: new Date(tradeFormState.tradedAt).toISOString(),
      notes: tradeFormState.notes.trim() ? tradeFormState.notes.trim() : null,
    };

    if (!payload.symbol) {
      setSubmittingTrade(false);
      setTradeFormError("Symbol is required");
      return;
    }

    const url = editingTrade ? `/api/trades/${editingTrade.id}` : "/api/trades";
    const method = editingTrade ? "PATCH" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorPayload = await response.json();
        throw new Error(errorPayload.error ?? "Unable to save trade");
      }

      closeTradeModal();
      await loadData(true);
    } catch (error) {
      setTradeFormError(error instanceof Error ? error.message : "Failed to save trade");
    } finally {
      setSubmittingTrade(false);
    }
  }

  async function handleDeleteTrade(trade: Trade) {
    const accepted = window.confirm(`Delete ${trade.side} trade for ${trade.symbol}?`);
    if (!accepted) {
      return;
    }

    try {
      const response = await fetch(`/api/trades/${trade.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Delete failed");
      }

      await loadData(false);
      await loadData(true);
    } catch (error) {
      setLoadingError(error instanceof Error ? error.message : "Delete failed");
    }
  }

  function openAddNetWorthModal(entryType: NetWorthEntryType, category: NetWorthCategory) {
    setEditingNetWorthEntry(null);
    setNetWorthFormState({
      entryType,
      category,
      label: "",
      amount: "",
    });
    setNetWorthFormError(null);
    setShowNetWorthModal(true);
  }

  function openEditNetWorthModal(entry: NetWorthEntry) {
    setEditingNetWorthEntry(entry);
    setNetWorthFormState(toNetWorthFormState(entry));
    setNetWorthFormError(null);
    setShowNetWorthModal(true);
  }

  function closeNetWorthModal() {
    setShowNetWorthModal(false);
    setEditingNetWorthEntry(null);
    setNetWorthFormState(DEFAULT_NET_WORTH_FORM);
    setNetWorthFormError(null);
  }

  async function handleNetWorthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittingNetWorth(true);
    setNetWorthFormError(null);

    const payload = {
      entryType: netWorthFormState.entryType,
      category: netWorthFormState.category,
      label: netWorthFormState.label.trim(),
      amount: Number(netWorthFormState.amount),
    };

    if (!payload.label) {
      setSubmittingNetWorth(false);
      setNetWorthFormError("Label is required");
      return;
    }

    const url = editingNetWorthEntry
      ? `/api/net-worth/entries/${editingNetWorthEntry.id}`
      : "/api/net-worth/entries";

    const method = editingNetWorthEntry ? "PATCH" : "POST";
    const body = editingNetWorthEntry
      ? JSON.stringify({ label: payload.label, amount: payload.amount })
      : JSON.stringify(payload);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body,
      });

      if (!response.ok) {
        const errorPayload = await response.json();
        throw new Error(errorPayload.error ?? "Unable to save net worth entry");
      }

      closeNetWorthModal();
      await loadData(false);
    } catch (error) {
      setNetWorthFormError(
        error instanceof Error ? error.message : "Failed to save net worth entry",
      );
    } finally {
      setSubmittingNetWorth(false);
    }
  }

  if (loading) {
    return <p className="status">Loading portfolio...</p>;
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <h1>Personal Finance Dashboard</h1>
          <p>Net worth + portfolio tracker (CAD)</p>
        </div>
        <div className="header-actions">
          <button className="button secondary" onClick={() => void loadData(true)}>
            Refresh Now
          </button>
          <button className="button" onClick={openAddTradeModal}>
            Add Trade
          </button>
        </div>
      </header>

      {loadingError ? <p className="error-banner">{loadingError}</p> : null}
      {portfolio?.quoteWarnings.length ? (
        <div className="warning-banner">
          {portfolio.quoteWarnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <section className="summary-grid summary-grid-4">
        <article className="summary-card">
          <h2>Total Assets</h2>
          <p>{formatCurrency(portfolio?.netWorth.summary.totalAssets ?? 0)}</p>
        </article>
        <article className="summary-card">
          <h2>Total Debts</h2>
          <p>{formatCurrency(portfolio?.netWorth.summary.totalDebts ?? 0)}</p>
        </article>
        <article className="summary-card">
          <h2>Net Worth</h2>
          <p>{formatCurrency(portfolio?.netWorth.summary.netWorth ?? 0)}</p>
        </article>
        <article className="summary-card">
          <h2>Portfolio Contribution</h2>
          <p>{formatCurrency(portfolio?.netWorth.summary.totalPortfolio ?? 0)}</p>
        </article>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Assets</h2>
          <p>Manual assets + linked portfolio value</p>
        </div>
        <div className="category-grid">
          {portfolio?.netWorth.assetsByCategory.map((group) => (
            <article key={group.category} className="category-card">
              <div className="category-header">
                <h3>{CATEGORY_LABELS[group.category]}</h3>
                <button
                  className="link-button"
                  onClick={() => openAddNetWorthModal("asset", group.category)}
                >
                  Add Item
                </button>
              </div>
              <p className="category-total">{formatCurrency(group.total)}</p>
              {group.entries.length ? (
                <ul className="entry-list">
                  {group.entries.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.label}</span>
                      <div className="entry-actions">
                        <span>{formatCurrency(entry.amount)}</span>
                        <button className="link-button" onClick={() => openEditNetWorthModal(entry)}>
                          Edit
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No entries</p>
              )}
            </article>
          ))}

          <article className="category-card portfolio-readonly">
            <div className="category-header">
              <h3>Portfolio (Live)</h3>
            </div>
            <p className="category-total">
              {formatCurrency(portfolio?.netWorth.summary.totalPortfolio ?? 0)}
            </p>
            <p className="empty-copy">Read-only from your holdings valuation.</p>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Debts</h2>
          <p>Mortgage and car lease balances</p>
        </div>
        <div className="category-grid two-column">
          {portfolio?.netWorth.debtsByCategory.map((group) => (
            <article key={group.category} className="category-card">
              <div className="category-header">
                <h3>{CATEGORY_LABELS[group.category as DebtCategory]}</h3>
                <button
                  className="link-button"
                  onClick={() => openAddNetWorthModal("debt", group.category)}
                >
                  Add Item
                </button>
              </div>
              <p className="category-total">{formatCurrency(group.total)}</p>
              {group.entries.length ? (
                <ul className="entry-list">
                  {group.entries.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.label}</span>
                      <div className="entry-actions">
                        <span>{formatCurrency(entry.amount)}</span>
                        <button className="link-button" onClick={() => openEditNetWorthModal(entry)}>
                          Edit
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-copy">No entries</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card">
          <h2>Portfolio Market Value</h2>
          <p>{formatCurrency(portfolio?.summary.totalMarketValue ?? 0)}</p>
        </article>
        <article className="summary-card">
          <h2>Portfolio Unrealized P&L</h2>
          <p>{formatCurrency(portfolio?.summary.totalUnrealizedPnl ?? 0)}</p>
        </article>
        <article className="summary-card">
          <h2>Portfolio Realized P&L</h2>
          <p>{formatCurrency(portfolio?.summary.totalRealizedPnl ?? 0)}</p>
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
            {portfolio?.holdings.length ? (
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
                    {position.quoteStale ? <span className="stale-tag">stale</span> : null}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="empty-row">
                  No holdings yet. Add your first trade.
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
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {portfolio?.trades.length ? (
              portfolio.trades.map((trade) => (
                <tr key={trade.id}>
                  <td>{new Date(trade.tradedAt).toLocaleString("en-CA")}</td>
                  <td>{trade.symbol}</td>
                  <td>{trade.assetType}</td>
                  <td className={trade.side === "buy" ? "buy" : "sell"}>{trade.side}</td>
                  <td>{formatQuantity(trade.quantity)}</td>
                  <td>{formatCurrency(trade.price)}</td>
                  <td>{formatCurrency(trade.fee)}</td>
                  <td>
                    <div className="table-actions">
                      <button className="link-button" onClick={() => openEditTradeModal(trade)}>
                        Edit
                      </button>
                      <button
                        className="link-button danger"
                        onClick={() => void handleDeleteTrade(trade)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="empty-row">
                  No trades recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {showTradeModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal" onSubmit={handleTradeSubmit}>
            <h2>{editingTrade ? "Edit Trade" : "Add Trade"}</h2>

            {tradeFormError ? <p className="form-error">{tradeFormError}</p> : null}

            <label>
              Symbol
              <input
                required
                maxLength={15}
                value={tradeFormState.symbol}
                disabled={Boolean(editingTrade)}
                onChange={(event) =>
                  setTradeFormState((prev) => ({ ...prev, symbol: event.target.value.toUpperCase() }))
                }
              />
            </label>

            <label>
              Asset Type
              <select
                value={tradeFormState.assetType}
                disabled={Boolean(editingTrade)}
                onChange={(event) =>
                  setTradeFormState((prev) => ({
                    ...prev,
                    assetType: event.target.value as AssetType,
                  }))
                }
              >
                <option value="equity">Stock / ETF</option>
                <option value="crypto">Crypto</option>
              </select>
            </label>

            <label>
              Side
              <select
                value={tradeFormState.side}
                onChange={(event) =>
                  setTradeFormState((prev) => ({ ...prev, side: event.target.value as TradeSide }))
                }
              >
                <option value="buy">Buy</option>
                <option value="sell">Sell</option>
              </select>
            </label>

            <label>
              Quantity
              <input
                required
                inputMode="decimal"
                type="number"
                min="0.00000001"
                step="0.00000001"
                value={tradeFormState.quantity}
                onChange={(event) =>
                  setTradeFormState((prev) => ({ ...prev, quantity: event.target.value }))
                }
              />
            </label>

            <label>
              Price
              <input
                required
                inputMode="decimal"
                type="number"
                min="0.00000001"
                step="0.00000001"
                value={tradeFormState.price}
                onChange={(event) =>
                  setTradeFormState((prev) => ({ ...prev, price: event.target.value }))
                }
              />
            </label>

            <label>
              Fee
              <input
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                value={tradeFormState.fee}
                onChange={(event) =>
                  setTradeFormState((prev) => ({ ...prev, fee: event.target.value }))
                }
              />
            </label>

            <label>
              Trade Date
              <input
                required
                type="datetime-local"
                value={tradeFormState.tradedAt}
                onChange={(event) =>
                  setTradeFormState((prev) => ({ ...prev, tradedAt: event.target.value }))
                }
              />
            </label>

            <label>
              Notes
              <textarea
                rows={3}
                maxLength={500}
                value={tradeFormState.notes}
                onChange={(event) =>
                  setTradeFormState((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={closeTradeModal}>
                Cancel
              </button>
              <button type="submit" className="button" disabled={submittingTrade}>
                {submittingTrade ? "Saving..." : "Save Trade"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showNetWorthModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal" onSubmit={handleNetWorthSubmit}>
            <h2>{editingNetWorthEntry ? "Edit Entry" : "Add Net Worth Entry"}</h2>

            {netWorthFormError ? <p className="form-error">{netWorthFormError}</p> : null}

            <label>
              Entry Type
              <select
                value={netWorthFormState.entryType}
                disabled={Boolean(editingNetWorthEntry)}
                onChange={(event) => {
                  const entryType = event.target.value as NetWorthEntryType;
                  const categories = categoriesForEntryType(entryType);
                  setNetWorthFormState((prev) => ({
                    ...prev,
                    entryType,
                    category: categories[0],
                  }));
                }}
              >
                <option value="asset">Asset</option>
                <option value="debt">Debt</option>
              </select>
            </label>

            <label>
              Category
              <select
                value={netWorthFormState.category}
                disabled={Boolean(editingNetWorthEntry)}
                onChange={(event) =>
                  setNetWorthFormState((prev) => ({
                    ...prev,
                    category: event.target.value as NetWorthCategory,
                  }))
                }
              >
                {categoriesForEntryType(netWorthFormState.entryType).map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Label
              <input
                required
                maxLength={100}
                value={netWorthFormState.label}
                onChange={(event) =>
                  setNetWorthFormState((prev) => ({ ...prev, label: event.target.value }))
                }
              />
            </label>

            <label>
              Amount
              <input
                required
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                value={netWorthFormState.amount}
                onChange={(event) =>
                  setNetWorthFormState((prev) => ({ ...prev, amount: event.target.value }))
                }
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={closeNetWorthModal}>
                Cancel
              </button>
              <button type="submit" className="button" disabled={submittingNetWorth}>
                {submittingNetWorth ? "Saving..." : "Save Entry"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
