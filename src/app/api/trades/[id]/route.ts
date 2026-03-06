import { NextResponse } from "next/server";
import { deleteTrade, getTradeById, updateTrade } from "@/lib/repository";
import { tradePayloadSchema } from "@/lib/validation";

export const runtime = "nodejs";

function parseTradeId(param: string) {
  const id = Number(param);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Invalid trade id");
  }

  return id;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await context.params;
    const tradeId = parseTradeId(idParam);
    const raw = await request.json();
    const payload = tradePayloadSchema.parse(raw);

    const existing = getTradeById(tradeId);
    if (!existing) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    if (
      payload.symbol.toUpperCase() !== existing.symbol ||
      payload.assetType !== existing.assetType
    ) {
      return NextResponse.json(
        { error: "Symbol and asset type cannot be changed during edit" },
        { status: 400 },
      );
    }

    const updated = updateTrade(tradeId, {
      side: payload.side,
      quantity: payload.quantity,
      price: payload.price,
      fee: payload.fee,
      tradedAt: payload.tradedAt,
      notes: payload.notes,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: idParam } = await context.params;
    const tradeId = parseTradeId(idParam);

    const deleted = deleteTrade(tradeId);

    if (!deleted) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to delete trade" }, { status: 400 });
  }
}
