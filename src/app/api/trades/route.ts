import { NextResponse } from "next/server";
import { createTrade } from "@/lib/repository";
import { tradePayloadSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const payload = tradePayloadSchema.parse(raw);

    const trade = createTrade(payload);

    return NextResponse.json(trade, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid trade payload" }, { status: 400 });
  }
}
