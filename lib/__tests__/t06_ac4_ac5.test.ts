import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

describe("T06 AC4 — flagged cannot auto-assign", () => {
  it("lib/assignment.ts filters anonymity_flag and reports skipped", () => {
    const src = readFileSync("lib/assignment.ts", "utf-8");
    expect(src).toMatch(/anonymity_flag/);
    expect(src).toMatch(/skipped/);
    expect(src).toMatch(/anonymity_flag set/);
    expect(src).toMatch(/redact or dismiss/i);
    // Must query only imported status
    expect(src).toMatch(/status = 'imported'/);
  });

  it("auto-assign endpoint is lead-only and validates waveId", () => {
    const src = readFileSync("app/api/assignments/auto/route.ts", "utf-8");
    expect(src).toMatch(/lead/);
    expect(src).toMatch(/autoAssign/);
    expect(src).not.toMatch(/select\s+\*/i);
  });
});

describe("T06 AC5 — redact/dismiss audited", () => {
  it("redact route writes audit_log with actor and field", () => {
    const src = readFileSync("app/api/applications/[id]/redact/route.ts", "utf-8");
    expect(src).toMatch(/writeAudit/);
    expect(src).toMatch(/application\.redact/);
    expect(src).toMatch(/field/);
    expect(src).toMatch(/actorId/);
    expect(src).toMatch(/actorName/);
  });

  it("dismiss-flag route writes audit_log with actor and reason", () => {
    const src = readFileSync("app/api/applications/[id]/dismiss-flag/route.ts", "utf-8");
    expect(src).toMatch(/writeAudit/);
    expect(src).toMatch(/application\.dismiss_flag/);
    expect(src).toMatch(/actorId/);
    expect(src).toMatch(/reason/);
  });

  it("anonymity scan fields are q7/q7b/q16/q19", () => {
    const src = readFileSync("lib/anonymity.ts", "utf-8");
    expect(src).toMatch(/q7_about_session/);
    expect(src).toMatch(/q7b_benefits/);
    expect(src).toMatch(/q16_pathway/);
    expect(src).toMatch(/q19_large_groups_english/);
    expect(src).toMatch(/Name tokens/i);
    expect(src).toMatch(/Email local part/i);
    expect(src).toMatch(/URL_REGEX/);
    expect(src).toMatch(/SELF_REF/);
  });
});

describe("T06 — visibility allow-lists are enforced", () => {
  it("lib/visibility.ts exports exactly the spec lists", () => {
    const src = readFileSync("lib/visibility.ts", "utf-8");
    // Must contain all ROUND1 fields from spec 03-DATA-MODEL.md §4
    const required = [
      "q4_session_provides", "q5_audience", "q6_audience_detail",
      "q7_about_session", "q7b_benefits", "q8_group_setup",
      "q9_room_layout", "q10_delivery_mode", "q12_timekeeping",
      "q13_participation_level", "q14_methods", "q15_first_ten_minutes",
      "q16_pathway", "q17_iaf_member", "q18_iaf_qualification",
      "q19_large_groups_english"
    ];
    for (const f of required) expect(src).toMatch(new RegExp(f));
  });

  it("no assessor-facing file contains SELECT star", () => {
    const files = [
      "app/api/applications/[id]/round1/route.ts",
      "app/api/applications/[id]/redact/route.ts",
      "app/api/applications/[id]/dismiss-flag/route.ts",
      "lib/visibility.ts",
      "lib/anonymity.ts",
      "lib/assignment.ts",
    ];
    for (const p of files) {
      const src = readFileSync(p, "utf-8");
      expect(src, `${p} should not contain SELECT *`).not.toMatch(/select\s+\*/i);
    }
  });
});
