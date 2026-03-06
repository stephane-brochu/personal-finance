import { NextResponse } from "next/server";
import { reprocessStatement } from "@/lib/statements/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id: idParam } = await context.params;
  const statementId = Number(idParam);

  if (!Number.isInteger(statementId) || statementId <= 0) {
    return NextResponse.json({ error: "Invalid statement id" }, { status: 400 });
  }

  try {
    const result = reprocessStatement(statementId);
    return NextResponse.json(result, {
      status: result.statement.status === "completed" ? 201 : 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reprocess failed";
    const status = /not found|missing/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
