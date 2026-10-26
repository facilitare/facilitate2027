/**
 * Hides the applicant's identity in answers served to assessors (round 1).
 * Uses what the applicant told us in Section 6 — full name, co-facilitator names,
 * email — plus any website/URL. Originals stay untouched in the DB for leads.
 * The applicant's own name becomes "[name]"; a co-facilitator's name becomes
 * "another facilitator" so the text still reads naturally ("with another facilitator").
 * Matching is whole-word and needs a capital letter, so "will" or "grace" in
 * ordinary prose is left alone while "Will" or "Grace" as a name is hidden.
 */
export type IdentitySource = {
  q20_full_name?: string | null;
  q23_cofacilitators?: string | null;
  q1_email?: string | null;
};

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|org|net|co\.uk|org\.uk|ro|eu|de|fr|nl|io|me)\b/gi;
const SKIP = new Set(["The", "And", "Dr", "Mr", "Mrs", "Ms", "With", "Will", "Have", "Several", "Not", "None", "Yet", "Tbc", "TBC"]);

const COFAC_LABEL = "another facilitator";

function addToken(set: Set<string>, t: string) {
  const w = t.replace(/[^\p{L}'-]/gu, "");
  if (w.length >= 3 && /^\p{Lu}/u.test(w) && !SKIP.has(w)) set.add(w);
}

function nameTokens(src: IdentitySource): { applicant: string[]; cofac: string[] } {
  const applicant = new Set<string>();
  const cofac = new Set<string>();
  (src.q20_full_name || "").split(/\s+/).forEach((t) => addToken(applicant, t));
  const local = (src.q1_email || "").split("@")[0] || "";
  local.split(/[._-]+/).forEach((p) => addToken(applicant, p.charAt(0).toUpperCase() + p.slice(1)));
  (src.q23_cofacilitators || "").split(/[\s,;&/]+/).forEach((t) => addToken(cofac, t));
  // A token that is also the applicant's own name stays "[name]".
  for (const t of applicant) cofac.delete(t);
  // Longest first so "Blackwell" is replaced before a shorter overlapping token.
  const byLength = (a: string, b: string) => b.length - a.length;
  return { applicant: [...applicant].sort(byLength), cofac: [...cofac].sort(byLength) };
}

function tokenRegex(tokens: string[]): RegExp | null {
  return tokens.length
    ? new RegExp(`(?<![\\p{L}])(?:${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}])`, "gu")
    : null;
}

export function makeMasker(src: IdentitySource) {
  const { applicant, cofac } = nameTokens(src);
  const applicantRe = tokenRegex(applicant);
  const cofacRe = tokenRegex(cofac);
  return (text: string | null | undefined): string | null => {
    if (text == null) return null;
    let t = text.replace(URL_RE, "[website]");
    if (applicantRe) {
      t = t.replace(applicantRe, "[name]");
      t = t.replace(/\[name\](?:\s+\[name\])+/g, "[name]");
    }
    if (cofacRe) {
      t = t.replace(cofacRe, COFAC_LABEL);
      // "Maria Popescu" -> one label; "Maria and Ion" -> "other facilitators"
      t = t.replace(new RegExp(`${COFAC_LABEL}(?:\\s+${COFAC_LABEL})+`, "g"), COFAC_LABEL);
      t = t.replace(new RegExp(`${COFAC_LABEL}(?:\\s*,\\s*|\\s+and\\s+|\\s*&\\s*)${COFAC_LABEL}`, "g"), "other facilitators");
    }
    return t;
  };
}
