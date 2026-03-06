import { NextResponse } from "next/server";
import { getStatementDetail } from "@/lib/statements/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id: idParam } = await context.params;
  const statementId = Number(idParam);

  if (!Number.isInteger(statementId) || statementId <= 0) {
    return NextResponse.json({ error: "Invalid statement id" }, { status: 400 });
  }

  try {
    const detail = getStatementDetail(statementId);
    if (!detail) {
      return NextResponse.json({ error: "Statement not found" }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load statement",
      },
      { status: 500 },
    );
  }
}
