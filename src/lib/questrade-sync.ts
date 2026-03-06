import { createHash } from "node:crypto";
import {
  getOrCreatePortfolioByName,
  setBrokerAccountSyncStatus,
  upsertBrokerAccount,
  upsertImportedCashSnapshot,
  upsertImportedTradeSnapshot,
} from "@/lib/repository";
import {
  getQuestradeActivities,
  getQuestradeBalances,
  getQuestradeRuntimeStatus,
  getQuestradePositions,
  isQuestradeConfigured,
  listQuestradeAccounts,
} from "@/lib/questrade";
import type {
  BrokerAccountSyncResult,
  BrokerSyncCounts,
  QuestradeSyncResult,
} from "@/lib/types";

const PROVIDER = "questrade" as const;
const SNAPSHOT_OCCURRED_AT = "1970-01-01T00:00:00.000Z";

function emptyCounts(): BrokerSyncCounts {
  return {
    parsed: 0,
    inserted: 0,
    deduped: 0,
    rejected: 0,
  };
}

function addCounts(target: BrokerSyncCounts, delta: BrokerSyncCounts) {
  target.parsed += delta.parsed;
  target.inserted += delta.inserted;
  target.deduped += delta.deduped;
  target.rejected += delta.rejected;
}

function hashFingerprint(parts: Array<string | number>) {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function defaultOccurredAt() {
  return new Date().toISOString();
}

function toIsoOrNow(value: string | null | undefined) {
  if (!value) {
    return defaultOccurredAt();
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return defaultOccurredAt();
  }

  return new Date(parsed).toISOString();
}

function monthsAgoIso(months: number) {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - months);
  return start.toISOString();
}

function isFinitePositive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeAction(action: string | undefined) {
  return (action ?? "").trim().toUpperCase();
}

function toSafeAmount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value === 0) {
    return null;
  }
  return value;
}

function accountPortfolioName(accountNumber: string) {
  return `Questrade ${accountNumber}`;
}

function finalizeStatus(result: BrokerAccountSyncResult) {
  if (result.errors.length === 0 && result.warnings.length === 0) {
    return "ok" as const;
  }

  if (result.counts.inserted + result.counts.deduped > 0) {
    return "partial" as const;
  }

  return "failed" as const;
}

async function importBalances(accountNumber: string, portfolioId: number, result: BrokerAccountSyncResult) {
  const balances = await getQuestradeBalances(accountNumber);
  const occurredAt = SNAPSHOT_OCCURRED_AT;
  result.counts.parsed += balances.length;

  for (const balance of balances) {
    const currency = String(balance.currency ?? "").toUpperCase() || "UNKNOWN";
    const cash = typeof balance.cash === "number" ? balance.cash : null;
    if (cash === null || !Number.isFinite(cash)) {
      result.counts.rejected += 1;
      result.warnings.push(`Skipping ${currency} balance row with invalid cash value`);
      continue;
    }

    const transactionType = cash >= 0 ? "deposit" : "withdrawal";
    const amount = cash >= 0 ? cash : -Math.abs(cash);
    const fingerprint = hashFingerprint([
      PROVIDER,
      accountNumber,
      "balance_snapshot",
      currency,
    ]);
    const upsertStatus = upsertImportedCashSnapshot({
      portfolioId,
      transactionType,
      amount,
      occurredAt,
      source: "questrade_balance_snapshot",
      fingerprint,
    });

    if (upsertStatus === "inserted") {
      result.counts.inserted += 1;
    } else {
      result.counts.deduped += 1;
    }
  }
}

async function importPositions(accountNumber: string, portfolioId: number, result: BrokerAccountSyncResult) {
  const positions = await getQuestradePositions(accountNumber);
  const tradedAt = SNAPSHOT_OCCURRED_AT;
  result.counts.parsed += positions.length;

  for (const position of positions) {
    const symbol = String(position.symbol ?? "").trim().toUpperCase();
    const openQuantity =
      typeof position.openQuantity === "number" && Number.isFinite(position.openQuantity)
        ? position.openQuantity
        : null;

    if (!symbol || !isFinitePositive(openQuantity)) {
      result.counts.rejected += 1;
      result.warnings.push("Skipping position row with missing symbol or quantity");
      continue;
    }

    const avgEntryPrice =
      typeof position.averageEntryPrice === "number" && Number.isFinite(position.averageEntryPrice)
        ? position.averageEntryPrice
        : 0;

    if (avgEntryPrice < 0) {
      result.counts.rejected += 1;
      result.warnings.push(`Skipping ${symbol} due to invalid average entry price`);
      continue;
    }

    const importFingerprint = hashFingerprint([
      PROVIDER,
      accountNumber,
      "position_snapshot",
      symbol,
    ]);

    const upsertStatus = upsertImportedTradeSnapshot({
      portfolioId,
      symbol,
      assetType: "equity",
      source: "questrade_position_snapshot",
      side: "buy",
      quantity: openQuantity,
      price: avgEntryPrice,
      fee: 0,
      tradedAt,
      notes: "Imported from Questrade position snapshot",
      importFingerprint,
    });

    if (upsertStatus === "inserted") {
      result.counts.inserted += 1;
    } else {
      result.counts.deduped += 1;
    }
  }
}

async function importActivities(accountNumber: string, portfolioId: number, result: BrokerAccountSyncResult) {
  const endIso = defaultOccurredAt();
  const startIso = monthsAgoIso(18);
  const activities = await getQuestradeActivities(accountNumber, startIso, endIso);
  result.counts.parsed += activities.length;

  for (const activity of activities) {
    const action = normalizeAction(activity.action);
    const occurredAt = activity.transactionDate
      ? toIsoOrNow(activity.transactionDate)
      : activity.tradeDate
        ? toIsoOrNow(activity.tradeDate)
        : defaultOccurredAt();

    const quantity =
      typeof activity.quantity === "number" && Number.isFinite(activity.quantity)
        ? Math.abs(activity.quantity)
        : null;
    const price = typeof activity.price === "number" && Number.isFinite(activity.price) ? activity.price : null;
    const commission =
      typeof activity.commission === "number" && Number.isFinite(activity.commission)
        ? Math.abs(activity.commission)
        : 0;
    const symbol = String(activity.symbol ?? "").trim().toUpperCase();

    if ((action === "BUY" || action === "SELL") && symbol && isFinitePositive(quantity) && (price ?? 0) >= 0) {
      const importFingerprint = hashFingerprint([
        PROVIDER,
        accountNumber,
        "activity_trade",
        action,
        symbol,
        occurredAt,
        quantity,
        price,
        commission,
      ]);

      const upsertStatus = upsertImportedTradeSnapshot({
        portfolioId,
        symbol,
        assetType: "equity",
        source: "questrade_activity",
        side: action === "BUY" ? "buy" : "sell",
        quantity,
        price: price ?? 0,
        fee: commission,
        tradedAt: occurredAt,
        notes: "Imported from Questrade activity",
        importFingerprint,
      });

      if (upsertStatus === "inserted") {
        result.counts.inserted += 1;
      } else {
        result.counts.deduped += 1;
      }
      continue;
    }

    const amount = toSafeAmount(activity.netAmount);
    if (amount === null) {
      continue;
    }

    const transactionType = amount >= 0 ? "deposit" : "withdrawal";
    const fingerprint = hashFingerprint([
      PROVIDER,
      accountNumber,
      "activity_cash",
      action || "UNKNOWN",
      occurredAt,
      amount,
      activity.description ?? "",
    ]);
    const upsertStatus = upsertImportedCashSnapshot({
      portfolioId,
      transactionType,
      amount: amount >= 0 ? amount : -Math.abs(amount),
      occurredAt,
      source: "questrade_activity",
      fingerprint,
    });
    if (upsertStatus === "inserted") {
      result.counts.inserted += 1;
    } else {
      result.counts.deduped += 1;
    }
  }
}

export async function syncAllQuestradeAccounts(): Promise<QuestradeSyncResult> {
  if (!isQuestradeConfigured()) {
    throw new Error("QUESTRADE_REFRESH_TOKEN is missing");
  }

  const accounts = await listQuestradeAccounts();
  const accountResults: BrokerAccountSyncResult[] = [];
  const globalCounts = emptyCounts();
  const globalWarnings: string[] = [];
  const globalErrors: string[] = [];
  const syncedAt = defaultOccurredAt();

  for (const account of accounts) {
    const accountNumber = String(account.number ?? "").trim();
    if (!accountNumber) {
      globalWarnings.push("Encountered Questrade account row with empty account number");
      continue;
    }

    const portfolio = getOrCreatePortfolioByName(accountPortfolioName(accountNumber));
    if (!portfolio) {
      globalErrors.push(`Failed to create or load portfolio for account ${accountNumber}`);
      continue;
    }

    upsertBrokerAccount({
      provider: PROVIDER,
      brokerAccountNumber: accountNumber,
      portfolioId: portfolio.id,
    });

    const accountResult: BrokerAccountSyncResult = {
      accountNumber,
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      status: "ok",
      counts: emptyCounts(),
      warnings: [],
      errors: [],
    };

    try {
      await importBalances(accountNumber, portfolio.id, accountResult);
    } catch (error) {
      accountResult.errors.push(
        `Balance sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    try {
      await importPositions(accountNumber, portfolio.id, accountResult);
    } catch (error) {
      accountResult.errors.push(
        `Position sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    try {
      await importActivities(accountNumber, portfolio.id, accountResult);
    } catch (error) {
      accountResult.warnings.push(
        `Activities sync skipped: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    accountResult.status = finalizeStatus(accountResult);

    setBrokerAccountSyncStatus({
      provider: PROVIDER,
      brokerAccountNumber: accountNumber,
      syncStatus: accountResult.status,
      lastError: accountResult.errors[0] ?? accountResult.warnings[0] ?? null,
      touchedAt: syncedAt,
    });

    addCounts(globalCounts, accountResult.counts);
    globalWarnings.push(...accountResult.warnings.map((message) => `${accountNumber}: ${message}`));
    globalErrors.push(...accountResult.errors.map((message) => `${accountNumber}: ${message}`));
    accountResults.push(accountResult);
  }

  if (accountResults.length === 0 && globalErrors.length === 0) {
    globalWarnings.push("No Questrade accounts were returned by the API");
  }

  const status = getQuestradeRuntimeStatus();
  if (!status.configured) {
    globalErrors.push("Questrade runtime is not configured");
  }

  return {
    provider: PROVIDER,
    counts: globalCounts,
    accounts: accountResults,
    warnings: globalWarnings,
    errors: globalErrors,
    syncedAt,
  };
}
