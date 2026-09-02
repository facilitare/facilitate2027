import { NormalizedRow } from "./normalize";

export interface AnonymityHit {
  field: string;
  reason: string;
}

export function scanAnonymity(row: NormalizedRow): AnonymityHit[] {
  const hits: AnonymityHit[] = [];
  const fieldsToScan: (keyof NormalizedRow)[] = [
    "q7_about_session",
    "q7b_benefits",
    "q16_pathway",
    "q19_large_groups_english",
  ];

  const fullName = (row.q20_full_name || "").trim();
  const nameTokens = fullName
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  const emailLocal = (() => {
    const e = row.q1_email || "";
    const at = e.indexOf("@");
    if (at > 0) {
      const local = e.slice(0, at);
      return local.length >= 4 ? local : null;
    }
    return null;
  })();

  const urlRegex = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|org|net|co\.uk|ro|eu|de|fr|nl)\b/gi;
  const selfRefRegex1 = /\bI (?:am|'m) [A-Z][a-z]+\b/;
  const selfRefRegex2 = /\bmy (?:company|firm|consultancy) \b/i;

  for (const field of fieldsToScan) {
    const text = (row[field] as string | null) || "";
    if (!text) continue;

    // Name tokens whole-word case-insensitive
    for (const tok of nameTokens) {
      const escaped = tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      if (re.test(text)) {
        hits.push({ field: String(field), reason: `contains applicant name "${tok}"` });
        break; // one per field per token? spec says one line per field
      }
    }

    // Email local part
    if (emailLocal) {
      const escaped = emailLocal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`, "i");
      if (re.test(text)) {
        hits.push({ field: String(field), reason: `contains email local part "${emailLocal}"` });
      }
    }

    // URLs/domains
    const urls = text.match(urlRegex);
    if (urls && urls.length) {
      hits.push({ field: String(field), reason: `contains URL/domain "${urls[0]}"` });
    }

    // Explicit self-reference
    if (selfRefRegex1.test(text) || selfRefRegex2.test(text)) {
      hits.push({ field: String(field), reason: `contains self-reference in ${String(field)}` });
    }
  }

  // Also detect explicit "I am <FirstName>" where firstName matches nameTokens[0]
  // Already covered by selfRefRegex1 + nameTokens but keep.

  return hits;
}
