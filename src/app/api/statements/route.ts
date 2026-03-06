import { NextResponse } from "next/server";
import { getStatements } from "@/lib/statements/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const statements = getStatements();
    return NextResponse.json({ statements });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load statements",
      },
      { status: 500 },
    );
  }
}
