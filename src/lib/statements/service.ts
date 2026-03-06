import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "@/lib/db";
import { createStatementRowFingerprint } from "@/lib/statements/fingerprint";
import { normalizeStatementRecords } from "@/lib/statements/normalize";
import { STATEMENT_PARSERS } from "@/lib/statements/parsers";
import { resolveParserAdapter } from "@/lib/statements/parsers/resolve";
import { extractTextFromPdfBuffer } from "@/lib/statements/pdf";
import {
  applyCashRecord,
  applyTradeRecord,
  createImportRun,
  createStatement,
  createStatementRow,
  findInsertedStatementRowByFingerprint,
  getAccountById,
  getOrCreateAccount,
  getStatementById,
  listStatementRows,
  listStatements,
  updateStatement,
  updateStatementRowStatus,
} from "@/lib/statements/repository";
import type {
  AccountType,
  Statement,
  StatementFormat,
  StatementIngestResult,
  StatementIngestStatus,
} from "@/lib/types";

type ImportInput = {
  institution: string;
  accountMask: string;
  accountType: AccountType;
  currency?: string;
  fileName: string;
  fileBuffer: Buffer;
  format?: StatementFormat;
  reprocessOfStatementId?: number | null;
};

function sanitizePathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function maskForPath(mask: string) {
  return sanitizePathSegment(mask.replace(/[^0-9a-z]/gi, "")) || "account";
}

function inferFormat(input: ImportInput): StatementFormat {
  if (input.format) {
    return input.format;
  }

  const ext = path.extname(input.fileName).toLowerCase();
  if (ext === ".csv") {
    return "csv";
  }

  if (ext === ".pdf") {
    return "pdf";
  }

  throw new Error("Unsupported file extension. Only .pdf and .csv are accepted");
}

function computeSha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hashAccountMask(mask: string) {
  return createHash("sha256").update(mask.trim()).digest("hex");
}

function ensureStoragePath(input: {
  institution: string;
  accountMask: string;
  periodStart: string | null;
  fileName: string;
  sha256: string;
}) {
  const statementsRoot = path.join(process.cwd(), "data", "statements");
  const institution = sanitizePathSegment(input.institution) || "institution";
  const account = maskForPath(input.accountMask);
  const month = input.periodStart ? input.periodStart.slice(0, 7) : new Date().toISOString().slice(0, 7);
  const fileExt = path.extname(input.fileName).toLowerCase() || ".dat";
  const basename = path.basename(input.fileName, fileExt);
  const safeName = sanitizePathSegment(basename) || "statement";

  const dir = path.join(statementsRoot, institution, account, month);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filename = `${safeName}-${input.sha256.slice(0, 12)}${fileExt}`;
  const filePath = path.join(dir, filename);

  return filePath;
}

function toText(input: { format: StatementFormat; fileBuffer: Buffer }) {
  if (input.format === "csv") {
    return input.fileBuffer.toString("utf8");
  }

  return extractTextFromPdfBuffer(input.fileBuffer);
}

function chooseFinalStatus(errors: string[]): StatementIngestStatus {
  return errors.length > 0 ? "failed" : "completed";
}

export function importStatement(input: ImportInput): StatementIngestResult {
  const format = inferFormat(input);
  const currency = (input.currency ?? "CAD").toUpperCase();
  const account = getOrCreateAccount({
    institution: input.institution.trim(),
    accountMask: input.accountMask.trim(),
    accountHash: hashAccountMask(input.accountMask),
    accountType: input.accountType,
    currency,
  });

  const parser = resolveParserAdapter(STATEMENT_PARSERS, {
    institution: input.institution,
    format,
  });

  if (!parser) {
    throw new Error(`Unsupported institution/format pair: ${input.institution} (${format})`);
  }

  const context = {
    institution: input.institution.trim(),
    accountType: input.accountType,
    currency,
    fileName: input.fileName,
    format,
  } as const;

  const sha256 = computeSha256(input.fileBuffer);

  let text: string;
  try {
    text = toText({ format, fileBuffer: input.fileBuffer });
  } catch (error) {
    const failedStatement = createStatement({
      accountId: account.id,
      fileName: input.fileName,
      filePath: "",
      format,
      sha256,
      periodStart: null,
      periodEnd: null,
      parserId: parser.id,
      parserVersion: parser.version,
      status: "failed",
      errorSummary: error instanceof Error ? error.message : "Failed to read file",
      warnings: [],
      counts: {
        parsed: 0,
        inserted: 0,
        deduped: 0,
        rejected: 0,
      },
      reprocessOfStatementId: input.reprocessOfStatementId ?? null,
    });

    if (!failedStatement) {
      throw new Error("Failed to create statement record");
    }

    createImportRun({
      statementId: failedStatement.id,
      runType: input.reprocessOfStatementId ? "reprocess" : "initial",
      status: "failed",
      errorSummary: failedStatement.errorSummary,
    });

    return {
      statement: failedStatement,
      counts: {
        parsed: 0,
        inserted: 0,
        deduped: 0,
        rejected: 0,
      },
      warnings: [],
      errors: [failedStatement.errorSummary ?? "Failed to read uploaded file"],
    };
  }

  let parsed;
  try {
    parsed = parser.parse({
      text,
      fileName: input.fileName,
      context,
    });
  } catch (error) {
    const failedStatement = createStatement({
      accountId: account.id,
      fileName: input.fileName,
      filePath: "",
      format,
      sha256,
      periodStart: null,
      periodEnd: null,
      parserId: parser.id,
      parserVersion: parser.version,
      status: "failed",
      errorSummary: error instanceof Error ? error.message : "Failed to parse statement",
      warnings: [],
      counts: {
        parsed: 0,
        inserted: 0,
        deduped: 0,
        rejected: 0,
      },
      reprocessOfStatementId: input.reprocessOfStatementId ?? null,
    });

    if (!failedStatement) {
      throw new Error("Failed to create failed statement record");
    }

    createImportRun({
      statementId: failedStatement.id,
      runType: input.reprocessOfStatementId ? "reprocess" : "initial",
      status: "failed",
      errorSummary: failedStatement.errorSummary,
    });

    return {
      statement: failedStatement,
      counts: {
        parsed: 0,
        inserted: 0,
        deduped: 0,
        rejected: 0,
      },
      warnings: [],
      errors: [failedStatement.errorSummary ?? "Failed to parse statement"],
    };
  }

  const normalized = normalizeStatementRecords(parsed.records);
  const finalFilePath = ensureStoragePath({
    institution: input.institution,
    accountMask: input.accountMask,
    periodStart: parsed.periodStart,
    fileName: input.fileName,
    sha256,
  });
  fs.writeFileSync(finalFilePath, input.fileBuffer);

  const warnings = [...parsed.warnings];
  const errors: string[] = [];

  const db = getDb();
  let statementId = 0;
  const counts = {
    parsed: normalized.length,
    inserted: 0,
    deduped: 0,
    rejected: 0,
  };

  const transaction = db.transaction(() => {
    const created = createStatement({
      accountId: account.id,
      fileName: input.fileName,
      filePath: finalFilePath,
      format,
      sha256,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      parserId: parser.id,
      parserVersion: parser.version,
      status: "processing",
      errorSummary: null,
      warnings,
      counts,
      reprocessOfStatementId: input.reprocessOfStatementId ?? null,
    });

    if (!created) {
      throw new Error("Failed to create statement row");
    }

    statementId = created.id;

    normalized.forEach((record, index) => {
      const fingerprint = createStatementRowFingerprint(account.id, record);
      const existing = findInsertedStatementRowByFingerprint(account.id, fingerprint);
      const occurredAt =
        record.recordType === "trade" ? record.tradedAt : record.occurredAt;

      if (existing) {
        counts.deduped += 1;
        createStatementRow({
          statementId,
          accountId: account.id,
          rowIndex: index,
          recordType: record.recordType,
          fingerprint,
          status: "deduped",
          sourceRef: record.sourceRef ?? null,
          symbol: record.recordType === "trade" ? record.symbol : null,
          side: record.recordType === "trade" ? record.side : null,
          quantity: record.recordType === "trade" ? record.quantity : null,
          price: record.recordType === "trade" ? record.price : null,
          fee: record.recordType === "trade" ? record.fee : null,
          amount: record.recordType === "cash_movement" ? record.amount : null,
          currency: record.currency,
          occurredAt,
          description: record.description ?? null,
          reference: record.reference ?? null,
          rawData: record.raw ?? null,
          errorMessage: null,
        });
        return;
      }

      if (record.recordType === "trade") {
        try {
          applyTradeRecord(record);
          createStatementRow({
            statementId,
            accountId: account.id,
            rowIndex: index,
            recordType: "trade",
            fingerprint,
            status: "inserted",
            sourceRef: record.sourceRef ?? null,
            symbol: record.symbol,
            side: record.side,
            quantity: record.quantity,
            price: record.price,
            fee: record.fee,
            amount: null,
            currency: record.currency,
            occurredAt: record.tradedAt,
            description: record.description ?? null,
            reference: record.reference ?? null,
            rawData: record.raw ?? null,
            errorMessage: null,
          });
          counts.inserted += 1;
        } catch (error) {
          counts.rejected += 1;
          const message = error instanceof Error ? error.message : "Trade import failed";
          errors.push(`Row ${index + 1}: ${message}`);

          createStatementRow({
            statementId,
            accountId: account.id,
            rowIndex: index,
            recordType: "trade",
            fingerprint,
            status: "rejected",
            sourceRef: record.sourceRef ?? null,
            symbol: record.symbol,
            side: record.side,
            quantity: record.quantity,
            price: record.price,
            fee: record.fee,
            amount: null,
            currency: record.currency,
            occurredAt: record.tradedAt,
            description: record.description ?? null,
            reference: record.reference ?? null,
            rawData: record.raw ?? null,
            errorMessage: message,
          });
        }

        return;
      }

      const statementRow = createStatementRow({
        statementId,
        accountId: account.id,
        rowIndex: index,
        recordType: "cash_movement",
        fingerprint,
        status: "inserted",
        sourceRef: record.sourceRef ?? null,
        symbol: null,
        side: null,
        quantity: null,
        price: null,
        fee: null,
        amount: record.amount,
        currency: record.currency,
        occurredAt: record.occurredAt,
        description: record.description ?? null,
        reference: record.reference ?? null,
        rawData: record.raw ?? null,
        errorMessage: null,
      });

      try {
        applyCashRecord(account.id, statementRow.id, record);
        counts.inserted += 1;
      } catch (error) {
        counts.rejected += 1;
        const message =
          error instanceof Error ? error.message : "Cash transaction import failed";
        errors.push(`Row ${index + 1}: ${message}`);
        updateStatementRowStatus(statementRow.id, {
          status: "rejected",
          errorMessage: message,
        });
      }
    });

    const finalStatus = chooseFinalStatus(errors);
    const errorSummary = errors.length ? `${errors.length} rows failed` : null;

    updateStatement(statementId, {
      status: finalStatus,
      errorSummary,
      warnings,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      counts,
    });

    createImportRun({
      statementId,
      runType: input.reprocessOfStatementId ? "reprocess" : "initial",
      status: finalStatus === "completed" ? "completed" : "failed",
      errorSummary,
    });
  });

  transaction();

  const statement = getStatementById(statementId);
  if (!statement) {
    throw new Error("Imported statement is missing after commit");
  }

  return {
    statement,
    counts,
    warnings,
    errors,
  };
}

export function getStatements() {
  return listStatements();
}

export function getStatementDetail(statementId: number) {
  const statement = getStatementById(statementId);
  if (!statement) {
    return null;
  }

  return {
    statement,
    rows: listStatementRows(statementId),
  };
}

export function reprocessStatement(statementId: number) {
  const statement = getStatementById(statementId);
  if (!statement) {
    throw new Error("Statement not found");
  }

  const account = getAccountById(statement.accountId);
  if (!account) {
    throw new Error("Account not found for statement");
  }

  if (!statement.filePath || !fs.existsSync(statement.filePath)) {
    throw new Error("Statement file is missing from local storage");
  }

  const buffer = fs.readFileSync(statement.filePath);

  return importStatement({
    institution: account.institution,
    accountMask: account.accountMask,
    accountType: account.accountType,
    currency: account.currency,
    fileName: statement.fileName,
    fileBuffer: buffer,
    format: statement.format,
    reprocessOfStatementId: statement.id,
  });
}

export type StatementDetail = {
  statement: Statement;
  rows: ReturnType<typeof listStatementRows>;
};
