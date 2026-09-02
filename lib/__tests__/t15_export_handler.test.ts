import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  getSql: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  writeAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/auth", () => ({
  verifySession: vi.fn(),
  getClientIp: vi.fn(() => null),
  // keep other exports that route may not use but prevent errors
  verifyAppPassword: vi.fn(),
  verifyAdminPassword: vi.fn(),
  signSession: vi.fn(),
  sessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  COOKIE_NAME: "fa27_session",
  checkRateLimit: vi.fn(),
  recordFail: vi.fn(),
  resetAttempts: vi.fn(),
  getClientIpFromRequest: vi.fn(() => null),
}));

import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";
import { verifySession } from "@/lib/auth";
import { GET } from "@/app/api/export/route";

const LEAD_ID = "00000000-0000-0000-0000-000000000001";
const ASSESSOR_ID = "00000000-0000-0000-0000-000000000002";

function mockVerify(role: "lead" | "assessor", id: string) {
  vi.mocked(verifySession).mockResolvedValue({ authed: true, evaluatorId: id, role } as any);
}

function makeSqlMock(apps: any[], assessments: any[], evaluators: any[], settings: any[] = []) {
  const mockSql: any = vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
    const sqlText = strings.join(" ").toLowerCase();
    if (sqlText.includes("from evaluators where id =")) {
      const id = values[0];
      const found = evaluators.find((e: any) => e.id === id);
      if (found) return [found];
      if (id === LEAD_ID) return [{ id: LEAD_ID, name: "Ingrid Halvorsen", role: "lead" }];
      if (id === ASSESSOR_ID) return [{ id: ASSESSOR_ID, name: "Marco Ferretti", role: "assessor" }];
      return [];
    }
    if (sqlText.includes("select id, name from evaluators order by name")) {
      return evaluators;
    }
    if (sqlText.includes("from settings where key in")) {
      return settings;
    }
    if (sqlText.includes("from applications")) {
      return apps;
    }
    if (sqlText.includes("from assessments")) {
      return assessments;
    }
    return [];
  });
  vi.mocked(getSql).mockReturnValue(mockSql);
  return mockSql;
}

describe("GET /api/export handler — scopes, auth, BOM, audit", () => {
  it("returns 401 when unauthenticated", async () => {
    vi.mocked(verifySession).mockResolvedValue(null as any);
    makeSqlMock([], [], []);
    const req = new Request("http://localhost/api/export?scope=scores");
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it("refuses scope=full for assessor (403) and does not audit", async () => {
    mockVerify("assessor", ASSESSOR_ID);
    makeSqlMock([], [], [{ id: LEAD_ID, name: "Ingrid Halvorsen" }, { id: ASSESSOR_ID, name: "Marco Ferretti" }]);
    vi.mocked(writeAudit).mockClear();
    const req = new Request("http://localhost/api/export?scope=full", { headers: { cookie: "fa27_session=dummy" } });
    const res = await GET(req as any);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "forbidden" });
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("allows scope=full for lead, returns CSV with BOM, audits, includes identity", async () => {
    mockVerify("lead", LEAD_ID);
    const apps = [
      {
        id: "app1",
        ref_code: "W1-001",
        wave_id: "wave1",
        status: "scored",
        q1_email: "andré@example.org",
        q20_full_name: "André Popescu — Ștefan",
        q21_bio: "bio",
        q22_headshot_url: "",
        q23_cofacilitators: "",
        q24_region: "europe",
        q25_ethnicity: "White European",
        q26_career_stage: "Mid career",
        q27_under_35: false,
        q28_gender: "Prefer not to say",
        q2_ticket_status: ["I have already paid"],
        q3_availability: ["Friday"],
        q4_session_provides: ["Facilitation specific skills"],
        q4_session_provides_other: null,
        q5_audience: ["Experienced facilitators"],
        q5_audience_other: null,
        q6_audience_detail: "detail",
        q7_about_session: 'hello, "world"\nnext line — tricky',
        q7b_benefits: "benefits",
        q8_group_setup: ["Between 30 to 50"],
        q8_group_setup_other: null,
        q9_room_layout: "Round tables",
        q9b_furniture: null,
        q10_delivery_mode: "solo",
        q11_theme: "craft",
        q12_timekeeping: "visible clock",
        q13_participation_level: 4,
        q14_methods: ["Small group discussion"],
        q14_methods_other: null,
        q15_first_ten_minutes: "silent writing",
        q16_pathway: "pathway",
        q17_iaf_member: "yes",
        q18_iaf_qualification: "certified_professional_facilitator",
        q19_large_groups_english: "large groups",
        iaf_standing: 2,
        submitted_at: new Date("2026-08-21T20:49:42Z"),
        imported_at: new Date("2026-08-21T20:49:42Z"),
      },
    ];
    const assessments = [
      { id: "a1", application_id: "app1", evaluator_id: ASSESSOR_ID, evaluator_name: "Marco Ferretti", focus_score: 2, content_score: 1, interactivity_score: 1, credibility_score: 1, feedback_liked: "liked A", feedback_improve: "improve A", private_note: "SECRET SHOULD NOT APPEAR", state: "submitted", submitted_at: new Date().toISOString() },
      { id: "a2", application_id: "app1", evaluator_id: LEAD_ID, evaluator_name: "Ingrid Halvorsen", focus_score: 1, content_score: 2, interactivity_score: 1, credibility_score: 1, feedback_liked: "liked B", feedback_improve: "improve B", private_note: "ANOTHER SECRET", state: "submitted", submitted_at: new Date().toISOString() },
    ];
    makeSqlMock(apps, assessments, [
      { id: ASSESSOR_ID, name: "Marco Ferretti", role: "assessor" },
      { id: LEAD_ID, name: "Ingrid Halvorsen", role: "lead" },
    ]);
    vi.mocked(writeAudit).mockClear();
    const req = new Request("http://localhost/api/export?scope=full", { headers: { cookie: "fa27_session=dummy" } });
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("export-full");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    const text = buf.toString("utf8");
    expect(text).toContain("\r\n");
    expect(text).toContain('"ref_code"');
    expect(text).toContain('"hello, ""world""\nnext line — tricky"');
    expect(text).toContain("André Popescu — Ștefan");
    expect(text).toContain("andré@example.org");
    expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "export.full", entity: "export", actorId: LEAD_ID }));
    expect(text).not.toContain("SECRET SHOULD NOT APPEAR");
    expect(text).not.toContain("ANOTHER SECRET");
  });

  it("scope=feedback excludes private notes but includes assembled feedback and non-ASCII", async () => {
    mockVerify("assessor", ASSESSOR_ID);
    const apps = [
      { id: "app1", ref_code: "W1-001", wave_id: "wave1", status: "scored", q1_email: "test@example.org", q20_full_name: "Tomás Ribeiro", q21_bio: null, q22_headshot_url: null, q23_cofacilitators: null, q24_region: null, q25_ethnicity: null, q26_career_stage: null, q27_under_35: null, q28_gender: null, q2_ticket_status: null, q3_availability: null, q4_session_provides: null, q4_session_provides_other: null, q5_audience: null, q5_audience_other: null, q6_audience_detail: null, q7_about_session: null, q7b_benefits: null, q8_group_setup: null, q8_group_setup_other: null, q9_room_layout: null, q9b_furniture: null, q10_delivery_mode: null, q11_theme: "change", q12_timekeeping: null, q13_participation_level: null, q14_methods: null, q14_methods_other: null, q15_first_ten_minutes: null, q16_pathway: null, q17_iaf_member: null, q18_iaf_qualification: null, q19_large_groups_english: null, iaf_standing: 0, submitted_at: null, imported_at: null },
    ];
    const assessments = [
      { id: "a1", application_id: "app1", evaluator_id: ASSESSOR_ID, evaluator_name: "Marco Ferretti", focus_score: 2, content_score: 1, interactivity_score: 2, credibility_score: 1, feedback_liked: "Loved the pace, very \"engaging\"", feedback_improve: "Try:\n- more time\n- less lecture", private_note: "PRIVATE NOTE 1 — must not appear", state: "submitted", submitted_at: new Date().toISOString() },
    ];
    makeSqlMock(apps, assessments, [{ id: ASSESSOR_ID, name: "Marco Ferretti" }]);
    vi.mocked(writeAudit).mockClear();
    const req = new Request("http://localhost/api/export?scope=feedback", { headers: { cookie: "fa27_session=dummy" } });
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString("utf8");
    expect(text).toContain('"ref_code","applicant_name","applicant_email","feedback"');
    expect(text).toContain('Loved the pace, very ""engaging""');
    expect(text).toContain("Tomás Ribeiro");
    expect(text).not.toContain("PRIVATE NOTE 1");
    expect(buf[0]).toBe(0xef);
    expect(writeAudit).not.toHaveBeenCalled();
  });

  it("scope=scores includes aggregates and per-assessor totals and BOM", async () => {
    mockVerify("lead", LEAD_ID);
    const apps = [
      { id: "app1", ref_code: "W1-001", wave_id: "wave1", status: "scored", q1_email: null, q20_full_name: null, q21_bio: null, q22_headshot_url: null, q23_cofacilitators: null, q24_region: null, q25_ethnicity: null, q26_career_stage: null, q27_under_35: null, q28_gender: null, q2_ticket_status: null, q3_availability: null, q4_session_provides: null, q4_session_provides_other: null, q5_audience: null, q5_audience_other: null, q6_audience_detail: null, q7_about_session: null, q7b_benefits: null, q8_group_setup: null, q8_group_setup_other: null, q9_room_layout: null, q9b_furniture: null, q10_delivery_mode: null, q11_theme: "craft", q12_timekeeping: null, q13_participation_level: null, q14_methods: null, q14_methods_other: null, q15_first_ten_minutes: null, q16_pathway: null, q17_iaf_member: null, q18_iaf_qualification: null, q19_large_groups_english: null, iaf_standing: 1, submitted_at: null, imported_at: null },
      { id: "app2", ref_code: "W1-002", wave_id: "wave1", status: "scored", q1_email: null, q20_full_name: null, q21_bio: null, q22_headshot_url: null, q23_cofacilitators: null, q24_region: null, q25_ethnicity: null, q26_career_stage: null, q27_under_35: null, q28_gender: null, q2_ticket_status: null, q3_availability: null, q4_session_provides: null, q4_session_provides_other: null, q5_audience: null, q5_audience_other: null, q6_audience_detail: null, q7_about_session: null, q7b_benefits: null, q8_group_setup: null, q8_group_setup_other: null, q9_room_layout: null, q9b_furniture: null, q10_delivery_mode: null, q11_theme: "clarity", q12_timekeeping: null, q13_participation_level: null, q14_methods: null, q14_methods_other: null, q15_first_ten_minutes: null, q16_pathway: null, q17_iaf_member: null, q18_iaf_qualification: null, q19_large_groups_english: null, iaf_standing: 0, submitted_at: null, imported_at: null },
    ];
    const assessments = [
      { id: "a1", application_id: "app1", evaluator_id: ASSESSOR_ID, evaluator_name: "Marco Ferretti", focus_score: 2, content_score: 2, interactivity_score: 1, credibility_score: 1, feedback_liked: "a", feedback_improve: "b", private_note: null, state: "submitted", submitted_at: new Date().toISOString() },
      { id: "a2", application_id: "app1", evaluator_id: LEAD_ID, evaluator_name: "Ingrid Halvorsen", focus_score: 1, content_score: 1, interactivity_score: 1, credibility_score: 1, feedback_liked: "c", feedback_improve: "d", private_note: null, state: "submitted", submitted_at: new Date().toISOString() },
      { id: "a3", application_id: "app2", evaluator_id: ASSESSOR_ID, evaluator_name: "Marco Ferretti", focus_score: 0, content_score: 0, interactivity_score: 0, credibility_score: 0, feedback_liked: "e", feedback_improve: "f", private_note: null, state: "submitted", submitted_at: new Date().toISOString() },
    ];
    makeSqlMock(apps, assessments, [
      { id: ASSESSOR_ID, name: "Marco Ferretti" },
      { id: LEAD_ID, name: "Ingrid Halvorsen" },
    ]);
    const req = new Request("http://localhost/api/export?scope=scores", { headers: { cookie: "fa27_session=dummy" } });
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString("utf8");
    expect(text).toContain('"mean_total"');
    expect(text).toContain('"normalised_total"');
    expect(text).toContain('"divergence"');
    expect(text).toContain('"quality_status"');
    expect(text).toContain('"total_Ingrid Halvorsen"');
    expect(text).toContain('"total_Marco Ferretti"');
    const lines = text.split("\r\n");
    expect(lines[0].split(",").length).toBeGreaterThan(12);
    expect(lines[1]).toContain('"W1-001"');
    expect(lines[2]).toContain('"W1-002"');
    expect(buf[0]).toBe(0xef);
  });

  it("rejects invalid scope and xlsx format", async () => {
    mockVerify("lead", LEAD_ID);
    makeSqlMock([], [], []);
    let req = new Request("http://localhost/api/export?scope=invalid", { headers: { cookie: "fa27_session=dummy" } });
    let res = await GET(req as any);
    expect(res.status).toBe(400);
    req = new Request("http://localhost/api/export?scope=scores&format=xlsx", { headers: { cookie: "fa27_session=dummy" } });
    res = await GET(req as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/XLSX/i);
  });
});
