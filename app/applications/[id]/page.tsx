import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import RedactionPanel from "@/components/RedactionPanel";
import DetailClient from "./detail-client";
import { redirect } from "next/navigation";

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("fa27_session")?.value;
  if (!token) redirect("/login");
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) redirect("/login");

  const sql = getSql();
  const evalRows = (await sql`select id, name, role from evaluators where id = ${session.evaluatorId}`) as any[];
  const evaluator = evalRows[0] as { id: string; name: string; role: string } | undefined;
  if (!evaluator) redirect("/who");
  const isLead = evaluator.role === "lead";

  if (!isLead) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 560, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 28, textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: "var(--danger-soft)", color: "var(--danger)", display: "grid", placeItems: "center", margin: "0 auto 14px", fontSize: 20, fontWeight: 700 }}>403</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Lead access only</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>
            The application detail with identities and decisions is available to panel leads only. You are signed in as <strong>{evaluator.name}</strong> (assessor).
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
            <a href="/" style={{ padding: "8px 14px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-text)", textDecoration: "none", fontWeight: 600, fontSize: 13 }}>← Back to dashboard</a>
            <a href="/applications" style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-sunk)", textDecoration: "none", color: "var(--text)", fontSize: 13 }}>Applications</a>
          </div>
        </div>
      </main>
    );
  }

  // Lead full read — explicit columns (no select star)
  const rows = (await sql`
    select
      id, ref_code, wave_id, status,
      q4_session_provides, q4_session_provides_other, q5_audience, q5_audience_other, q6_audience_detail,
      q7_about_session, q7b_benefits, q8_group_setup, q8_group_setup_other, q9_room_layout, q9b_furniture, q10_delivery_mode, q11_theme, q12_timekeeping,
      q13_participation_level, q14_methods, q14_methods_other, q15_first_ten_minutes, q16_pathway, q17_iaf_member, q18_iaf_qualification, q19_large_groups_english,
      q1_email, q2_ticket_status, q3_availability, q20_full_name, q21_bio, q22_headshot_url, q23_cofacilitators, q24_region, q25_ethnicity, q26_career_stage, q27_under_35, q28_gender,
      iaf_standing, anonymity_flag, anonymity_notes, redacted_q7, redacted_q7b, redacted_q16, redacted_q19, redacted_by, redacted_at,
      created_at, updated_at
    from applications
    where id = ${id}
    limit 1
  `) as any[];
  if (rows.length === 0) {
    return (
      <main style={{ padding: 32 }}>
        <a href="/applications" style={{ fontSize: 13, color: "var(--text-muted)" }}>← Applications</a>
        <h1 style={{ marginTop: 16 }}>Application not found</h1>
      </main>
    );
  }
  const appRow = rows[0] as any;

  // Enrich wave name
  let waveName: string | null = null;
  try {
    const w = (await sql`select name from waves where id = ${appRow.wave_id} limit 1`) as any[];
    if (w.length) waveName = w[0].name;
  } catch { /* ignore */ }

  const app = { ...appRow, wave_name: waveName };

  // Settings for mode label (every total must state mode)
  let iafBonusMode: "additive" | "tiebreak" = "additive";
  try {
    const r = await sql`select value from settings where key = 'iaf_bonus_mode'`;
    const v = (r as any[])[0]?.value;
    if (v != null) {
      const parsed = typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v;
      if (parsed === "additive" || parsed === "tiebreak") iafBonusMode = parsed;
    }
  } catch {}

  // Every assessment for this application (lead sees all, any state)
  const assessments = (await sql`
    select
      a.id, a.application_id, a.evaluator_id, e.name as evaluator_name, a.state,
      a.focus_score, a.content_score, a.interactivity_score, a.credibility_score,
      a.focus_no_evidence, a.content_no_evidence, a.interactivity_no_evidence, a.credibility_no_evidence,
      a.feedback_liked, a.feedback_improve, a.private_note, a.submitted_at, a.updated_at
    from assessments a
    join evaluators e on e.id = a.evaluator_id
    where a.application_id = ${id}
    order by e.name asc
  `) as any[];

  // Decision history with decider name
  let decisions: any[] = [];
  try {
    decisions = (await sql`
      select d.id, d.decision, d.rationale, d.override_quality_standard, d.override_reason, d.decided_by, e.name as decided_by_name, d.decided_at
      from panel_decisions d
      left join evaluators e on e.id = d.decided_by
      where d.application_id = ${id}
      order by d.decided_at desc
    `) as any[];
  } catch (e: any) {
    // table may not exist yet in some env — keep empty
    decisions = [];
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 20 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--accent)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>F27</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>FACILITATE 2027</span>
          <span style={{ fontSize: 12, color: "var(--text-faint)", marginLeft: 6, borderLeft: "1px solid var(--border)", paddingLeft: 10 }}>Signed in as <strong style={{ color: "var(--text)" }}>{evaluator.name}</strong> · lead</span>
        </a>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/applications" style={{ fontSize: 13, color: "var(--text)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 999, padding: "5px 12px", background: "var(--surface-sunk)" }}>← Applications</a>
          <a href="/who" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 999, padding: "5px 12px", background: "var(--surface-sunk)" }}>Switch user</a>
        </div>
      </header>

      <main style={{ maxWidth: 1060, margin: "24px auto", padding: "0 24px 40px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{app.ref_code}</h1>
          <span style={{ fontSize: 12, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px", background: "var(--surface-sunk)" }}>{app.q11_theme ?? "—"} · {app.status}</span>
          {app.anonymity_flag ? <span style={{ fontSize: 11, color: "#92400e", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 999, padding: "2px 8px", fontWeight: 600 }}>⚠️ anonymity flagged</span> : null}
          {waveName ? <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {waveName}</span> : null}
        </div>

        <div style={{ marginTop: 18 }}>
          <RedactionPanel
            applicationId={app.id}
            anonymityFlag={app.anonymity_flag}
            anonymityNotes={app.anonymity_notes}
            fields={[
              { key: "q7_about_session", label: "Q7 — About session", original: app.q7_about_session, redacted: app.redacted_q7 },
              { key: "q7b_benefits", label: "Q7b — Benefits", original: app.q7b_benefits, redacted: app.redacted_q7b },
              { key: "q16_pathway", label: "Q16 — Pathway", original: app.q16_pathway, redacted: app.redacted_q16 },
              { key: "q19_large_groups_english", label: "Q19 — Large groups / English", original: app.q19_large_groups_english, redacted: app.redacted_q19 },
            ]}
          />
        </div>

        <div style={{ marginTop: 18 }}>
          <DetailClient app={app as any} assessments={assessments as any} decisions={decisions as any} iafBonusMode={iafBonusMode} />
        </div>
      </main>
    </div>
  );
}
