function unescapePdfString(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")");
}

export function extractTextFromPdfBuffer(buffer: Buffer) {
  const content = buffer.toString("latin1");

  if (!content.startsWith("%PDF")) {
    throw new Error("Uploaded file is not a valid PDF");
  }

  if (!content.includes("/Font")) {
    throw new Error("PDF appears to be image-only and cannot be parsed in v1");
  }

  const matches = [...content.matchAll(/\(([^\)]*)\)/g)].map((match) =>
    unescapePdfString(match[1]),
  );

  const text = matches
    .join("\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

  if (text.length < 20) {
    throw new Error("Unable to extract text from PDF. Ensure this is a text-based statement PDF");
  }

  return text;
}
