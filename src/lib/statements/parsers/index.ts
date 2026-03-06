import type { ParserAdapter } from "@/lib/types";
import { sampleBankCsvParser } from "@/lib/statements/parsers/sample-bank-csv";
import { sampleBrokerPdfParser } from "@/lib/statements/parsers/sample-broker-pdf";

export const STATEMENT_PARSERS: ParserAdapter[] = [
  sampleBankCsvParser,
  sampleBrokerPdfParser,
];
