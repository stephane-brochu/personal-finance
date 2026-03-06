import type { ParserAdapter } from "@/lib/types";

export function resolveParserAdapter(
  adapters: ParserAdapter[],
  input: { institution: string; format: "pdf" | "csv" },
) {
  const institution = input.institution.trim().toLowerCase();

  return (
    adapters.find(
      (adapter) =>
        adapter.institution.toLowerCase() === institution &&
        adapter.formats.includes(input.format),
    ) ?? null
  );
}
