import { NextResponse } from "next/server";
import { getQuestradeRuntimeStatus } from "@/lib/questrade";
import { listBrokerAccounts } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const runtime = getQuestradeRuntimeStatus();
    const accounts = listBrokerAccounts("questrade");
    const lastSyncedAt = accounts
      .map((item) => item.lastSyncedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

    return NextResponse.json({
      provider: "questrade",
      configured: runtime.configured,
      practiceMode: runtime.practiceMode,
      hasSession: runtime.hasSession,
      sessionExpiresAt: runtime.sessionExpiresAt,
      accountMappings: accounts.length,
      lastSyncedAt,
      accounts,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load Questrade status",
      },
      { status: 500 },
    );
  }
}
