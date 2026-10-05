/**
 * Hides the applicant's identity in answers served to assessors (round 1).
 * Uses what the applicant told us in Section 6 — full name, co-facilitator names,
 * email — plus any website/URL. Originals stay untouched in the DB for leads.
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

function nameTokens(src: IdentitySource): string[] {
  const out = new Set<string>();
  const add = (t: string) => {
    const w = t.replace(/[^\p{L}'-]/gu, "");
    if (w.length >= 3 && /^\p{Lu}/u.test(w) && !SKIP.has(w)) out.add(w);
  };
  (src.q20_full_name || "").split(/\s+/).forEach(add);
  (src.q23_cofacilitators || "").split(/[\s,;&/]+/).forEach(add);
  const local = (src.q1_email || "").split("@")[0] || "";
  local.split(/[._-]+/).forEach((p) => add(p.charAt(0).toUpperCase() + p.slice(1)));
  // Longest first so "Blackwell" is replaced before a shorter overlapping token.
  return [...out].sort((a, b) => b.length - a.length);
}

export function makeMasker(src: IdentitySource) {
  const tokens = nameTokens(src);
  const re = tokens.length
    ? new RegExp(`(?<![\\p{L}])(?:${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\p{L}])`, "gu")
    : null;
  return (text: string | null | undefined): string | null => {
    if (text == null) return null;
    let t = text.replace(URL_RE, "[website]");
    if (re) {
      t = t.replace(re, "[name]");
      t = t.replace(/\[name\](?:\s+\[name\])+/g, "[name]");
    }
    return t;
  };
}
