import { FIELD_DEFS, FieldKey } from "./constants";

export interface HeaderMapping {
  fieldToHeader: Map<FieldKey, string>; // field -> original header string
  headerToField: Map<string, FieldKey>; // original header -> field
  unmappedHeaders: string[];
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
}

function scoreMatch(headerNorm: string, aliasNorm: string): number {
  if (!headerNorm || !aliasNorm) return 0;
  if (headerNorm === aliasNorm) return 100;
  if (headerNorm.startsWith(aliasNorm)) return 95;
  if (aliasNorm.startsWith(headerNorm) && headerNorm.length > 5) return 90;
  // substring on first 20 chars fuzzy per spec: case-insensitive substring on first 40
  const a20 = aliasNorm.slice(0, 20);
  const h20 = headerNorm.slice(0, 20);
  if (a20.length >= 8 && headerNorm.includes(a20)) return 80;
  if (h20.length >= 8 && aliasNorm.includes(h20)) return 80;
  if (headerNorm.includes(aliasNorm)) return 70;
  if (aliasNorm.includes(headerNorm) && headerNorm.length > 8) return 70;
  return 0;
}

export function mapHeaders(headers: string[]): HeaderMapping {
  const fieldToHeader = new Map<FieldKey, string>();
  const headerToField = new Map<string, FieldKey>();
  const unmappedHeaders: string[] = [];

  const usedFields = new Set<FieldKey>();

  for (const h of headers) {
    const trimmed = h.trim();
    // skip truly empty header (trailing empty column in live CSV)
    if (trimmed === "") {
      continue;
    }
    const hNorm = norm(trimmed);
    let bestField: FieldKey | null = null;
    let bestScore = 0;
    for (const def of FIELD_DEFS) {
      for (const alias of def.aliases) {
        const aNorm = norm(alias);
        const sc = scoreMatch(hNorm, aNorm);
        if (sc > bestScore) {
          bestScore = sc;
          bestField = def.field;
        }
      }
    }
    if (bestField && bestScore >= 70 && !usedFields.has(bestField)) {
      fieldToHeader.set(bestField, h);
      headerToField.set(h, bestField);
      usedFields.add(bestField);
    } else {
      unmappedHeaders.push(h);
    }
  }
  return { fieldToHeader, headerToField, unmappedHeaders };
}
