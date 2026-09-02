import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import RedactionPanel from "@/components/RedactionPanel";
import { redirect } from "next/navigation";

export default async function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("fa27_session")?.value;
  if (!token) redirect("/login");
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) redirect("/login");

  const sql = getSql();
  const evalRows = await sql`select id, name, role from evaluators where id = ${session.evaluatorId}`;
  const evaluator = (evalRows as any[])[0];
  if (!evaluator) redirect("/who");
  const isLead = evaluator.role === "lead";

  // Full application — explicit columns, but lead sees everything
  const rows = await sql`
    select
      id, ref_code, wave_id, status,
      q4_session_provides, q4_session_provides_other, q5_audience, q5_audience_other, q6_audience_detail,
      q7_about_session, q7b_benefits, q8_group_setup, q8_group_setup_other, q9_room_layout, q10_delivery_mode, q11_theme, q12_timekeeping,
      q13_participation_level, q14_methods, q14_methods_other, q15_first_ten_minutes, q16_pathway, q17_iaf_member, q18_iaf_qualification, q19_large_groups_english,
      q1_email, q2_ticket_status, q3_availability, q20_full_name, q21_bio, q22_headshot_url, q23_cofacilitators, q24_region, q25_ethnicity, q26_career_stage, q27_under_35, q28_gender,
      iaf_standing, anonymity_flag, anonymity_notes, redacted_q7, redacted_q7b, redacted_q16, redacted_q19, redacted_by, redacted_at,
      created_at, updated_at
    from applications
    where id = ${id}
    limit 1
  `;
  if ((rows as any[]).length === 0) {
    return <main style={{ padding: 32 }}><h1>Application not found</h1></main>;
  }
  const app = (rows as any[])[0];

  // If not lead, enforce assignment check similar to round1
  if (!isLead) {
    const assigned = await sql`select id from assessments where application_id = ${id} and evaluator_id = ${evaluator.id} limit 1`;
    if ((assigned as any[]).length === 0) {
      return <main style={{ padding: 32 }}><h1 style={{ color: "#b91c1c" }}>403 — Not assigned to this application</h1><p>A lead can view any application.</p></main>;
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: "32px auto", padding: "0 24px" }}>
      <a href="/applications" style={{ fontSize: 13, color: "var(--text-muted)" }}>← Applications</a>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginTop: 12 }}>{app.ref_code} — {app.q11_theme}</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Status: {app.status} {app.anonymity_flag ? "· ⚠️ flagged" : ""}</p>

      {isLead ? (
        <div style={{ marginTop: 24 }}>
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
      ) : (
        <div style={{ marginTop: 24, padding: 16, border: "1px solid var(--border)", borderRadius: 12 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Lead-only redaction controls — you are signed in as assessor.</p>
        </div>
      )}

      <section style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
        <h2 style={{ fontWeight: 600 }}>Application content (round 1)</h2>
        <div style={{ display: "grid", gap: 12, marginTop: 12, fontSize: 14 }}>
          <div><strong>Q7</strong> <span style={{ fontFamily: "serif" }}>{app.redacted_q7 ?? app.q7_about_session ?? "—"}</span></div>
          <div><strong>Q7b</strong> {app.redacted_q7b ?? app.q7b_benefits ?? "—"}</div>
          <div><strong>Q16</strong> {app.redacted_q16 ?? app.q16_pathway ?? "—"}</div>
          <div><strong>Q19</strong> {app.redacted_q19 ?? app.q19_large_groups_english ?? "—"}</div>
          <div><strong>Q12</strong> {app.q12_timekeeping ?? "—"}</div>
          <div><strong>Q15</strong> {app.q15_first_ten_minutes ?? "—"}</div>
        </div>
      </section>

      {isLead && (
        <section style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
          <h2 style={{ fontWeight: 600 }}>Identity (lead only)</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 12, fontSize: 14 }}>
            <div><strong>Name</strong> {app.q20_full_name ?? "—"}</div>
            <div><strong>Email</strong> {app.q1_email ?? "—"}</div>
            <div><strong>Region</strong> {app.q24_region ?? "—"}</div>
            <div><strong>Co-facilitators</strong> {app.q23_cofacilitators ?? "—"}</div>
            <div><strong>IAF standing</strong> {app.iaf_standing ?? "—"}</div>
          </div>
        </section>
      )}
    </main>
  );
}
