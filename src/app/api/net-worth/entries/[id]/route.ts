import { NextResponse } from "next/server";
import { getNetWorthEntryById, updateNetWorthEntry } from "@/lib/repository";
import { netWorthEntryUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";

function parseEntryId(param: string) {
  const entryId = Number(param);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    throw new Error("Invalid entry id");
  }

  return entryId;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await context.params;
    const entryId = parseEntryId(idParam);

    const existing = getNetWorthEntryById(entryId);
    if (!existing) {
      return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    }

    const raw = await request.json();
    const payload = netWorthEntryUpdateSchema.parse(raw);

    const updated = updateNetWorthEntry(entryId, payload);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid net worth entry payload" }, { status: 400 });
  }
}
