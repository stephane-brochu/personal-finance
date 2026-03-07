import { NextResponse } from "next/server";
import { getBrokerPortfolioSnapshots } from "@/lib/portfolio-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const refreshQuotes = searchParams.get("refresh") !== "0";
  const provider = searchParams.get("provider");

  if (provider !== "questrade") {
    return NextResponse.json({ error: "provider=questrade is required" }, { status: 400 });
  }

  try {
    const portfolios = await getBrokerPortfolioSnapshots("questrade", refreshQuotes);
    return NextResponse.json({ portfolios });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load broker portfolios",
      },
      { status: 500 },
    );
  }
}
