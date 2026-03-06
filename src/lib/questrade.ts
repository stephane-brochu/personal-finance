import fs from "node:fs";
import path from "node:path";

type QuestradeTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  api_server: string;
};

type QuestradeSession = {
  accessToken: string;
  refreshToken: string;
  apiServer: string;
  expiresAtMs: number;
};

type QuestradeQuote = {
  price: number;
  quotedAt: string;
};

type QuestradeAccount = {
  number: string;
};

let cachedSession: QuestradeSession | null = null;
const symbolIdCache = new Map<string, number>();
const MAX_ACTIVITY_WINDOW_DAYS = 30;
const ONE_SECOND_MS = 1_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1_000;
const ENV_FILE_PATH = path.join(process.cwd(), ".env.local");

function getRefreshTokenSeed() {
  return process.env.QUESTRADE_REFRESH_TOKEN?.trim() ?? "";
}

function persistRefreshToken(refreshToken: string) {
  process.env.QUESTRADE_REFRESH_TOKEN = refreshToken;

  try {
    const envContents = fs.existsSync(ENV_FILE_PATH)
      ? fs.readFileSync(ENV_FILE_PATH, "utf8")
      : "";
    const line = `QUESTRADE_REFRESH_TOKEN=${refreshToken}`;

    if (envContents.includes("QUESTRADE_REFRESH_TOKEN=")) {
      const updated = envContents.replace(
        /^QUESTRADE_REFRESH_TOKEN=.*$/m,
        line,
      );
      fs.writeFileSync(ENV_FILE_PATH, updated.endsWith("\n") ? updated : `${updated}\n`, "utf8");
      return;
    }

    const prefix = envContents.length > 0 && !envContents.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(ENV_FILE_PATH, `${envContents}${prefix}${line}\n`, "utf8");
  } catch (error) {
    console.warn(
      `Failed to persist rotated Questrade refresh token: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function isPracticeMode() {
  return process.env.QUESTRADE_IS_PRACTICE === "true";
}

function getTokenEndpoint() {
  return isPracticeMode()
    ? "https://practicelogin.questrade.com/oauth2/token"
    : "https://login.questrade.com/oauth2/token";
}

function getActiveRefreshToken() {
  return cachedSession?.refreshToken ?? getRefreshTokenSeed();
}

function buildApiUrl(apiServer: string, route: string, params?: URLSearchParams) {
  const normalized = apiServer.endsWith("/") ? apiServer.slice(0, -1) : apiServer;
  const path = route.startsWith("/") ? route : `/${route}`;
  const query = params ? `?${params.toString()}` : "";
  return `${normalized}${path}${query}`;
}

async function refreshSession() {
  const refreshToken = getActiveRefreshToken();
  if (!refreshToken) {
    throw new Error("QUESTRADE_REFRESH_TOKEN is missing");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const url = `${getTokenEndpoint()}?${params.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Questrade token refresh failed (${response.status})${details ? `: ${details.slice(0, 300)}` : ""}`,
    );
  }

  const payload = (await response.json()) as Partial<QuestradeTokenResponse>;
  if (
    !payload.access_token ||
    !payload.refresh_token ||
    !payload.api_server ||
    typeof payload.expires_in !== "number"
  ) {
    throw new Error("Invalid Questrade token response");
  }

  const session: QuestradeSession = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    apiServer: payload.api_server,
    expiresAtMs: Date.now() + payload.expires_in * 1000,
  };

  cachedSession = session;
  persistRefreshToken(payload.refresh_token);
  return session;
}

async function getSession() {
  if (cachedSession && cachedSession.expiresAtMs - Date.now() > 60_000) {
    return cachedSession;
  }

  return refreshSession();
}

async function questradeRequest<T>(
  route: string,
  options?: { params?: URLSearchParams },
): Promise<T> {
  const session = await getSession();
  const run = async (token: string) =>
    fetch(buildApiUrl(session.apiServer, route, options?.params), {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

  let response = await run(session.accessToken);
  if (response.status === 401) {
    const renewed = await refreshSession();
    response = await run(renewed.accessToken);
  }

  if (!response.ok) {
    const details = await response.text();
    throw new Error(
      `Questrade API request failed (${response.status}) for ${route}${details ? `: ${details.slice(0, 300)}` : ""}`,
    );
  }

  return (await response.json()) as T;
}

function parseDateOrNow(value: string | null | undefined) {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return new Date().toISOString();
  }

  return new Date(parsed).toISOString();
}

function getTorontoOffset(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    timeZoneName: "longOffset",
  });
  const offsetPart = formatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")
    ?.value;

  if (!offsetPart) {
    return "-05:00";
  }

  return offsetPart.replace("GMT", "");
}

function formatQuestradeDateTime(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${lookup("year")}-${lookup("month")}-${lookup("day")}T${lookup("hour")}:${lookup("minute")}:${lookup("second")}${getTorontoOffset(date)}`;
}

function chunkDateRange(start: Date, end: Date) {
  const windows: Array<{ start: Date; end: Date }> = [];
  let cursorMs = start.getTime();
  const endMs = end.getTime();

  while (cursorMs <= endMs) {
    const windowEndMs = Math.min(
      cursorMs + MAX_ACTIVITY_WINDOW_DAYS * ONE_DAY_MS - ONE_SECOND_MS,
      endMs,
    );
    windows.push({
      start: new Date(cursorMs),
      end: new Date(windowEndMs),
    });
    cursorMs = windowEndMs + ONE_SECOND_MS;
  }

  return windows;
}

export function isQuestradeConfigured() {
  return getRefreshTokenSeed().length > 0;
}

export async function listQuestradeAccounts() {
  const payload = await questradeRequest<{ accounts?: QuestradeAccount[] }>("/v1/accounts");
  return payload.accounts ?? [];
}

export async function getQuestradeBalances(accountNumber: string) {
  const payload = await questradeRequest<{
    perCurrencyBalances?: Array<{
      currency?: string;
      cash?: number;
      totalEquity?: number;
      isRealTime?: boolean;
    }>;
  }>(`/v1/accounts/${encodeURIComponent(accountNumber)}/balances`);

  return payload.perCurrencyBalances ?? [];
}

export async function getQuestradePositions(accountNumber: string) {
  const payload = await questradeRequest<{
    positions?: Array<{
      symbol?: string;
      symbolId?: number;
      openQuantity?: number;
      averageEntryPrice?: number;
      currentMarketValue?: number;
      currentPrice?: number;
    }>;
  }>(`/v1/accounts/${encodeURIComponent(accountNumber)}/positions`);

  return payload.positions ?? [];
}

export async function getQuestradeActivities(
  accountNumber: string,
  startIso: string,
  endIso: string,
) {
  const start = new Date(startIso);
  const end = new Date(endIso);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid activity date range");
  }

  if (start > end) {
    return [];
  }

  const allActivities: Array<{
    action?: string;
    symbol?: string;
    quantity?: number;
    price?: number;
    commission?: number;
    tradeDate?: string;
    transactionDate?: string;
    netAmount?: number;
    description?: string;
    currency?: string;
    type?: string;
  }> = [];

  for (const window of chunkDateRange(start, end)) {
    const params = new URLSearchParams({
      startTime: formatQuestradeDateTime(window.start),
      endTime: formatQuestradeDateTime(window.end),
    });

    const payload = await questradeRequest<{
      activities?: Array<{
        action?: string;
        symbol?: string;
        quantity?: number;
        price?: number;
        commission?: number;
        tradeDate?: string;
        transactionDate?: string;
        netAmount?: number;
        description?: string;
        currency?: string;
        type?: string;
      }>;
    }>(`/v1/accounts/${encodeURIComponent(accountNumber)}/activities`, { params });

    allActivities.push(...(payload.activities ?? []));
  }

  return allActivities;
}

export async function resolveQuestradeSymbolId(symbol: string) {
  const normalized = symbol.trim().toUpperCase();
  const cached = symbolIdCache.get(normalized);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({ prefix: normalized });
  const payload = await questradeRequest<{
    symbols?: Array<{ symbol?: string; symbolId?: number }>;
  }>("/v1/symbols/search", { params });

  const exact = payload.symbols?.find(
    (item) => item.symbol?.toUpperCase() === normalized && Number.isFinite(item.symbolId),
  );

  if (!exact?.symbolId) {
    throw new Error(`Questrade symbol not found for ${symbol}`);
  }

  symbolIdCache.set(normalized, exact.symbolId);
  return exact.symbolId;
}

export async function fetchQuestradeQuote(symbol: string): Promise<QuestradeQuote> {
  const symbolId = await resolveQuestradeSymbolId(symbol);
  const payload = await questradeRequest<{
    quotes?: Array<{
      lastTradePrice?: number;
      lastTradePriceTrHrs?: number;
      delay?: number;
      lastTradeTime?: string;
    }>;
  }>(`/v1/markets/quotes/${symbolId}`);

  const quote = payload.quotes?.[0];
  const price =
    typeof quote?.lastTradePriceTrHrs === "number" && quote.lastTradePriceTrHrs > 0
      ? quote.lastTradePriceTrHrs
      : quote?.lastTradePrice;

  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Error(`Questrade quote unavailable for ${symbol}`);
  }

  return {
    price,
    quotedAt: parseDateOrNow(quote?.lastTradeTime),
  };
}

export function getQuestradeRuntimeStatus() {
  return {
    configured: isQuestradeConfigured(),
    practiceMode: isPracticeMode(),
    hasSession: cachedSession !== null,
    sessionExpiresAt:
      cachedSession && Number.isFinite(cachedSession.expiresAtMs)
        ? new Date(cachedSession.expiresAtMs).toISOString()
        : null,
  };
}

export function resetQuestradeRuntimeForTests() {
  cachedSession = null;
  symbolIdCache.clear();
}
