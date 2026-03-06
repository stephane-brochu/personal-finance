import { NextResponse } from "next/server";
import { createPortfolio, listPortfolios } from "@/lib/repository";
import { portfolioCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ portfolios: listPortfolios() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load portfolios" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const payload = portfolioCreateSchema.parse(raw);
    const portfolio = createPortfolio(payload.name);
    return NextResponse.json(portfolio, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid portfolio payload" },
      { status: 400 },
    );
  }
}
