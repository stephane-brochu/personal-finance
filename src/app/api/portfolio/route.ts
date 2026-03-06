import { NextResponse } from "next/server";
import { getPortfolioSnapshot } from "@/lib/portfolio-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refreshQuotes = searchParams.get("refresh") !== "0";

  try {
    const snapshot = await getPortfolioSnapshot(refreshQuotes);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load portfolio",
      },
      { status: 500 },
    );
  }
}
