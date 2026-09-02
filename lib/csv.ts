/**
 * lib/csv.ts — hand-written CSV serialiser per 04-SPEC §8
 *
 * Requirements:
 * - quote every field
 * - escape " by doubling
 * - CRLF line endings
 * - UTF-8 BOM so Excel opens it correctly
 *
 * No external CSV library is used. This file must remain hand-written.
 */

/** UTF-8 BOM character — prepend to the CSV string before encoding. */
export const CSV_BOM = "\uFEFF";

/** UTF-8 BOM bytes */
export const CSV_BOM_BYTES = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * Quote a single field value. Every field is quoted regardless of content.
 * Null/undefined become an empty quoted field ("").
 * Double quotes inside the value are escaped by doubling them.
 */
export function csvQuote(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  // Escape every double-quote by doubling it, then wrap in quotes
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Alias: escape a field (same as csvQuote). Provided for alternative naming in tests.
 */
export function escapeCsvField(value: unknown): string {
  return csvQuote(value);
}

/**
 * Serialise headers + rows into a CSV string.
 * - Every field is quoted via csvQuote
 * - Rows are joined with CRLF
 * - Final line ends with CRLF (Excel-friendly)
 * - No BOM included — caller decides (use serializeCsvWithBom or prepend CSV_BOM)
 */
export function serializeCsv(headers: string[], rows: unknown[][]): string {
  const lines: string[] = [];
  lines.push(headers.map(csvQuote).join(","));
  for (const row of rows) {
    // Ensure row length matches headers; pad or trim if needed
    const fields: string[] = [];
    for (let i = 0; i < headers.length; i++) {
      fields.push(csvQuote(i < row.length ? row[i] : ""));
    }
    lines.push(fields.join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/**
 * Serialise and return a Buffer with UTF-8 BOM prepended.
 * Use this for HTTP responses so Excel detects UTF-8 correctly.
 */
export function serializeCsvWithBom(headers: string[], rows: unknown[][]): Buffer {
  const csv = serializeCsv(headers, rows);
  // Prepend BOM bytes
  return Buffer.concat([CSV_BOM_BYTES, Buffer.from(csv, "utf8")]);
}

/**
 * Convenience: serialise to a UTF-8 string that already starts with the BOM character.
 * Suitable when the caller will do Buffer.from(str, "utf8") or new TextEncoder.
 */
export function serializeCsvStringWithBom(headers: string[], rows: unknown[][]): string {
  return CSV_BOM + serializeCsv(headers, rows);
}
