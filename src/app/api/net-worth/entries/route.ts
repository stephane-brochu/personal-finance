import { NextResponse } from "next/server";
import { createNetWorthEntry, listNetWorthEntries } from "@/lib/repository";
import { netWorthEntryCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const entries = listNetWorthEntries();
    return NextResponse.json(entries);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load net worth entries" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const payload = netWorthEntryCreateSchema.parse(raw);
    const entry = createNetWorthEntry(payload);

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid net worth entry payload" }, { status: 400 });
  }
}
