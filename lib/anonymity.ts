/**
 * Anonymity leak scan — 03-DATA-MODEL.md §5
 * Scans free-text fields for accidental self-identification at import time.
 * This is a heuristic net, not a guarantee.
 */

export type ScanInput = {
  q7_about_session?: string | null;
  q7b_benefits?: string | null;
  q16_pathway?: string | null;
  q19_large_groups_english?: string | null;
  q20_full_name?: string | null;
  q1_email?: string | null;
};

export type ScanResult = {
  flagged: boolean;
  notes: string[];
};

const URL_REGEX =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|org|net|co\.uk|ro|eu|de|fr|nl)\b/gi;

const SELF_REF_REGEX_1 = /\bI (?:am|'m) [A-Z][a-z]+\b/g;
const SELF_REF_REGEX_2 = /\bmy (?:company|firm|consultancy) \b/gi;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Scan free-text fields for anonymity leaks.
 * - Name tokens: split q20_full_name on whitespace, keep 3+ chars, case-insensitive whole-word match
 * - Email local part: before @, if 4+ chars, case-insensitive substring
 * - URLs and domains
 * - Explicit self-reference
 * Returns flagged boolean and human-readable notes per hit.
 */
export function scanAnonymity(input: ScanInput): ScanResult {
  const notes: string[] = [];

  const fields: Array<[string, string | null | undefined]> = [
    ["q7", input.q7_about_session],
    ["q7b", input.q7b_benefits],
    ["q16", input.q16_pathway],
    ["q19", input.q19_large_groups_english],
  ];

  // Prepare name tokens
  const nameTokens: string[] = [];
  if (input.q20_full_name) {
    const tokens = input.q20_full_name.split(/\s+/).filter((t) => t.length >= 3);
    for (const t of tokens) nameTokens.push(t);
  }

  // Email local part
  let emailLocal: string | null = null;
  if (input.q1_email && input.q1_email.includes("@")) {
    const local = input.q1_email.split("@")[0];
    if (local.length >= 4) emailLocal = local;
  }

  for (const [fieldName, raw] of fields) {
    if (!raw) continue;
    const text = raw;

    // 1. Name tokens — whole-word, case-insensitive
    for (const token of nameTokens) {
      const re = new RegExp(`\\b${escapeRegex(token)}\\b`, "i");
      if (re.test(text)) {
        notes.push(`${fieldName}: contains applicant name "${token}"`);
      }
    }

    // 2. Email local part — substring case-insensitive, 4+ chars
    if (emailLocal) {
      if (text.toLowerCase().includes(emailLocal.toLowerCase())) {
        notes.push(`${fieldName}: contains email local part "${emailLocal}"`);
      }
    }

    // 3. URLs and domains
    // Need to reset lastIndex because global regex
    URL_REGEX.lastIndex = 0;
    const urlMatch = text.match(URL_REGEX);
    if (urlMatch && urlMatch.length > 0) {
      for (const m of urlMatch) {
        notes.push(`${fieldName}: contains URL/domain "${m}"`);
      }
    }

    // 4a. Explicit self-reference: I am / I'm + Capitalised name
    SELF_REF_REGEX_1.lastIndex = 0;
    const self1 = text.match(SELF_REF_REGEX_1);
    if (self1) {
      for (const m of self1) {
        notes.push(`${fieldName}: possible self-identification "${m.trim()}"`);
      }
    }

    // 4b. my company/firm/consultancy
    SELF_REF_REGEX_2.lastIndex = 0;
    const self2 = text.match(SELF_REF_REGEX_2);
    if (self2) {
      for (const m of self2) {
        notes.push(`${fieldName}: possible self-reference "${m.trim()}"`);
      }
    }
  }

  return { flagged: notes.length > 0, notes };
}

/**
 * Map redacted field request to DB column.
 * Accepts both ROUND1 field names and short aliases.
 */
export const REDACT_FIELD_MAP: Record<string, string> = {
  q7_about_session: "redacted_q7",
  q7: "redacted_q7",
  redacted_q7: "redacted_q7",
  q7b_benefits: "redacted_q7b",
  q7b: "redacted_q7b",
  redacted_q7b: "redacted_q7b",
  q16_pathway: "redacted_q16",
  q16: "redacted_q16",
  redacted_q16: "redacted_q16",
  q19_large_groups_english: "redacted_q19",
  q19: "redacted_q19",
  redacted_q19: "redacted_q19",
};

export const ALLOWED_REDACT_DB_COLUMNS = [
  "redacted_q7",
  "redacted_q7b",
  "redacted_q16",
  "redacted_q19",
] as const;
