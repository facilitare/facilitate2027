import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { ROUND1_FIELDS, IDENTITY_FIELDS } from "@/lib/visibility";
import { scanAnonymity } from "@/lib/anonymity";

describe("T06 AC1 — ROUND1_FIELDS ∩ IDENTITY_FIELDS = ∅", () => {
  it("intersection is empty", () => {
    const r = new Set(ROUND1_FIELDS as readonly string[]);
    const i = new Set(IDENTITY_FIELDS as readonly string[]);
    const intersection = [...r].filter((x) => i.has(x));
    expect(intersection, `intersection should be empty but got ${intersection.join(", ")}`).toEqual([]);
  });
  it("ROUND1_FIELDS does not contain identity-sensitive columns", () => {
    const forbidden = ["q1_email", "q20_full_name", "q24_region", "iaf_standing", "anonymity_flag", "redacted_q7"];
    for (const f of forbidden) {
      expect((ROUND1_FIELDS as readonly string[]).includes(f)).toBe(false);
    }
  });
});

describe("T06 AC2 — leak test with Wilhelmina Okonkwo", () => {
  it("scan detects name tokens in q7/q16", () => {
    const result = scanAnonymity({
      q7_about_session: "I, Wilhelmina Okonkwo, will present at www.example.com and I am Wilhelmina",
      q7b_benefits: "Learn from my consultancy work at example.org",
      q16_pathway: "My company does great work in Berlin — see https://my-site.ro",
      q19_large_groups_english: "I have experience with large groups",
      q20_full_name: "Wilhelmina Okonkwo",
      q1_email: "wilhelmina.okonkwo@example.org",
    });
    expect(result.flagged).toBe(true);
    // Should have hits for Okonkwo, Wilhelmina, URLs, self-reference
    const joined = result.notes.join(" | ");
    expect(joined).toMatch(/Okonkwo/i);
    expect(joined).toMatch(/Wilhelmina/i);
    expect(joined).toMatch(/example\.org/i);
    expect(joined).toMatch(/my company/i);
  });

  it("round1 substitution hides Okonkwo when redaction exists", () => {
    // Simulate GET /api/applications/:id/round1 substitution logic
    const row = {
      q7_about_session: "Session about facilitation by Wilhelmina Okonkwo at www.okonkwo.com",
      q7b_benefits: "Benefits include learning from Wilhelmina",
      q16_pathway: "I am Wilhelmina — 10 years experience",
      q19_large_groups_english: "Experience in English for Okonkwo labs",
      redacted_q7: "Session about facilitation [redacted]",
      redacted_q7b: "Benefits include learning [redacted]",
      redacted_q16: "10 years experience",
      redacted_q19: "Experience in English",
    };
    const result: Record<string, unknown> = {
      q7_about_session: row.q7_about_session,
      q7b_benefits: row.q7b_benefits,
      q16_pathway: row.q16_pathway,
      q19_large_groups_english: row.q19_large_groups_english,
    };
    if (row.redacted_q7 != null) result.q7_about_session = row.redacted_q7;
    if (row.redacted_q7b != null) result.q7b_benefits = row.redacted_q7b;
    if (row.redacted_q16 != null) result.q16_pathway = row.redacted_q16;
    if (row.redacted_q19 != null) result.q19_large_groups_english = row.redacted_q19;

    const payload = JSON.stringify(result);
    expect(payload).not.toMatch(/Okonkwo/i);
    expect(payload).not.toMatch(/wilhelmina/i);
  });

  it("email local part detection triggers on 4+ chars only", () => {
    const shortEmail = scanAnonymity({
      q7_about_session: "Contact me at a@b",
      q20_full_name: "Test User",
      q1_email: "ab@example.org", // local part 2 chars — should NOT flag
    });
    // short local part should not produce email hit
    const hasEmailHit = shortEmail.notes.some((n) => n.includes("email local part"));
    expect(hasEmailHit).toBe(false);

    const longEmail = scanAnonymity({
      q7_about_session: "Contact wilh@example.org and my name is wilh lives here",
      q20_full_name: "Wilh Test",
      q1_email: "wilh@example.org",
    });
    const hasLongHit = longEmail.notes.some((n) => n.includes("email local part"));
    expect(hasLongHit).toBe(true);
  });

  it("name tokens of <3 chars are ignored (e.g. Jo)", () => {
    const r = scanAnonymity({
      q7_about_session: "Session by Jo will be great",
      q20_full_name: "Jo Bo", // both tokens <3 → no name hit expected
      q1_email: "jo@example.org",
    });
    // Should not have name hit for Jo/Bo
    const nameHits = r.notes.filter((n) => n.includes("applicant name"));
    expect(nameHits.length).toBe(0);
  });

  it("URL/domains and self-reference patterns are caught", () => {
    const r = scanAnonymity({
      q7_about_session: "Visit www.facilitation.com and https://my-site.eu for details. My firm delivered it.",
      q20_full_name: "Alice Cooper",
      q1_email: "alice@example.org",
    });
    const joined = r.notes.join(" ");
    expect(joined).toMatch(/facilitation\.com/i);
    expect(joined).toMatch(/my-site\.eu/i);
    expect(joined).toMatch(/my firm/i);
  });
});

describe("T06 AC3 — no select * in assessor-facing paths", () => {
  it("round1 route spells columns explicitly", () => {
    const src = readFileSync("app/api/applications/[id]/round1/route.ts", "utf-8");
    expect(src).not.toMatch(/select\s+\*/i);
    // Must contain explicit ROUND1 column names
    expect(src).toMatch(/q7_about_session/);
    expect(src).toMatch(/q7b_benefits/);
    expect(src).toMatch(/q16_pathway/);
    expect(src).toMatch(/q19_large_groups_english/);
    expect(src).toMatch(/redacted_q7/);
  });

  it("redact/dismiss routes do not use select *", () => {
    const redact = readFileSync("app/api/applications/[id]/redact/route.ts", "utf-8");
    const dismiss = readFileSync("app/api/applications/[id]/dismiss-flag/route.ts", "utf-8");
    expect(redact).not.toMatch(/select\s+\*/i);
    expect(dismiss).not.toMatch(/select\s+\*/i);
  });
});
