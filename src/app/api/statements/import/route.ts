import { NextResponse } from "next/server";
import { importStatement } from "@/lib/statements/service";
import type { AccountType, StatementFormat } from "@/lib/types";

export const runtime = "nodejs";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required field: ${key}`);
  }

  return value.trim();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing statement file" }, { status: 400 });
    }

    const institution = readString(formData, "institution");
    const accountMask = readString(formData, "accountMask");
    const accountTypeRaw = readString(formData, "accountType").toLowerCase();
    const currency = (formData.get("currency") as string | null)?.trim() || "CAD";
    const formatRaw = (formData.get("format") as string | null)?.trim().toLowerCase() || "";

    if (accountTypeRaw !== "brokerage" && accountTypeRaw !== "bank") {
      return NextResponse.json(
        { error: "accountType must be one of: brokerage, bank" },
        { status: 400 },
      );
    }

    if (formatRaw && formatRaw !== "pdf" && formatRaw !== "csv") {
      return NextResponse.json(
        { error: "format must be one of: pdf, csv" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = importStatement({
      institution,
      accountMask,
      accountType: accountTypeRaw as AccountType,
      currency,
      fileName: file.name,
      fileBuffer: buffer,
      format: formatRaw ? (formatRaw as StatementFormat) : undefined,
    });

    return NextResponse.json(result, {
      status: result.statement.status === "completed" ? 201 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Statement import failed",
      },
      { status: 400 },
    );
  }
}
