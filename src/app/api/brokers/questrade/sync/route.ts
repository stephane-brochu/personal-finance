import { NextResponse } from "next/server";
import { syncAllQuestradeAccounts } from "@/lib/questrade-sync";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await syncAllQuestradeAccounts();
    const statusCode = result.errors.length > 0 ? 207 : 200;
    return NextResponse.json(result, { status: statusCode });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Questrade sync failed" },
      { status: 400 },
    );
  }
}
