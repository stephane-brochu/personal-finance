import { NextResponse } from "next/server";
import { importYahooPortfolioCsv } from "@/lib/yahoo-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const portfolioId = Number(formData.get("portfolioId"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing CSV file" }, { status: 400 });
    }

    if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
      return NextResponse.json({ error: "portfolioId is required" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return NextResponse.json({ error: "Only CSV files are supported" }, { status: 400 });
    }

    const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    const result = importYahooPortfolioCsv(portfolioId, text);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Yahoo CSV import failed",
      },
      { status: 400 },
    );
  }
}
