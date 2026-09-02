"use client";
import { useState, useMemo, useCallback } from "react";
import { computeAggregates, formatMeanForDisplay, type ScoringAssessment } from "@/lib/scoring";
import { buildAggregatedFeedback, CRITERION_LABELS } from "@/lib/feedback";
import { ThemeBadge } from "@/components/ui/theme-badge";
import { Chip } from "@/components/ui/chip";

type Application = {
  id: string;
  ref_code: string;
  wave_id: string;
  wave_name?: string | null;
  status: string;
  q4_session_provides: string[] | null;
  q4_session_provides_other: string | null;
  q5_audience: string[] | null;
  q5_audience_other: string | null;
  q6_audience_detail: string | null;
  q7_about_session: string | null;
  q7b_benefits: string | null;
  q8_group_setup: string[] | null;
  q8_group_setup_other: string | null;
  q9_room_layout: string | null;
  q9b_furniture: string | null;
  q10_delivery_mode: string | null;
  q11_theme: string | null;
  q12_timekeeping: string | null;
  q13_participation_level: number | null;
  q14_methods: string[] | null;
  q14_methods_other: string | null;
  q15_first_ten_minutes: string | null;
  q16_pathway: string | null;
  q17_iaf_member: string | null;
  q18_iaf_qualification: string | null;
  q19_large_groups_english: string | null;
  // identity
  q1_email: string | null;
  q2_ticket_status: string[] | null;
  q3_availability: string[] | null;
  q20_full_name: string | null;
  q21_bio: string | null;
  q22_headshot_url: string | null;
  q23_cofacilitators: string | null;
  q24_region: string | null;
  q25_ethnicity: string | null;
  q26_career_stage: string | null;
  q27_under_35: boolean | null;
  q28_gender: string | null;
  iaf_standing: number | null;
  anonymity_flag: boolean;
  anonymity_notes: string | null;
  redacted_q7: string | null;
  redacted_q7b: string | null;
  redacted_q16: string | null;
  redacted_q19: string | null;
  created_at?: string;
  updated_at?: string;
};

type Assessment = {
  id: string;
  application_id: string;
  evaluator_id: string;
  evaluator_name: string;
  state: string;
  focus_score: number | null;
  content_score: number | null;
  interactivity_score: number | null;
  credibility_score: number | null;
  focus_no_evidence: boolean;
  content_no_evidence: boolean;
  interactivity_no_evidence: boolean;
  credibility_no_evidence: boolean;
  feedback_liked: string | null;
  feedback_improve: string | null;
  private_note: string | null;
  submitted_at: string | null;
  updated_at: string | null;
};

type PanelDecision = {
  id: string;
  decision: string;
  rationale: string | null;
  override_quality_standard: boolean;
  override_reason: string | null;
  decided_by: string;
  decided_by_name?: string | null;
  decided_at: string;
};

const DECISIONS = [
  { value: "accept", label: "Accept" },
  { value: "decline", label: "Decline" },
  { value: "defer", label: "Defer" },
  { value: "standby", label: "Standby" },
  { value: "reserve", label: "Reserve" },
] as const;

function fmt(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(1);
}

function chips(items: string[] | null, other?: string | null) {
  const arr = items ?? [];
  if (arr.length === 0 && !other) return <span style={{ color: "var(--text-faint)", fontSize: 13 }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {arr.map((v, i) => (
        <Chip key={i}>{v}</Chip>
      ))}
      {other ? <Chip>{other}</Chip> : null}
    </div>
  );
}

function qualityBadge(status: string) {
  if (status === "pass") return <span style={{ background: "var(--score-2-soft)", color: "var(--score-2)", border: "1px solid var(--score-2)", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em" }}>Pass</span>;
  if (status === "below_standard") return <span style={{ background: "var(--score-0-soft)", color: "var(--score-0)", border: "1px solid var(--score-0)", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".03em" }}>Below standard</span>;
  return <span style={{ background: "var(--surface-sunk)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>Insufficient data</span>;
}

export default function DetailClient({
  app,
  assessments,
  decisions,
  iafBonusMode = "additive",
}: {
  app: Application;
  assessments: Assessment[];
  decisions: PanelDecision[];
  iafBonusMode?: "additive" | "tiebreak";
}) {
  const submitted = useMemo(() => assessments.filter((a) => a.state === "submitted"), [assessments]);

  const aggregates = useMemo(() => {
    const inputs: ScoringAssessment[] = submitted.map((a) => ({
      evaluatorId: a.evaluator_id,
      state: a.state,
      focus_score: a.focus_score ?? 0,
      content_score: a.content_score ?? 0,
      interactivity_score: a.interactivity_score ?? 0,
      credibility_score: a.credibility_score ?? 0,
    }));
    return computeAggregates(inputs as any);
  }, [submitted]);

  const feedback = useMemo(() => {
    const inputs = submitted.map((a) => ({
      evaluatorId: a.evaluator_id,
      evaluatorName: a.evaluator_name,
      feedback_liked: a.feedback_liked,
      feedback_improve: a.feedback_improve,
      focus_no_evidence: a.focus_no_evidence,
      content_no_evidence: a.content_no_evidence,
      interactivity_no_evidence: a.interactivity_no_evidence,
      credibility_no_evidence: a.credibility_no_evidence,
      private_note: a.private_note,
    }));
    return buildAggregatedFeedback(inputs);
  }, [submitted]);

  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const doCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(feedback.text);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 1500);
    }
  }, [feedback.text]);

  // decision form
  const [decision, setDecision] = useState<string>("accept");
  const [rationale, setRationale] = useState("");
  const [overrideChecked, setOverrideChecked] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const rationaleValid = rationale.trim().length >= 10;
  const overrideValid = !overrideChecked || overrideReason.trim().length >= 10;
  const canSubmit = rationaleValid && overrideValid && !submitting;

  const onSubmitDecision = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          rationale: rationale.trim(),
          override: overrideChecked,
          overrideReason: overrideReason.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitMsg({ kind: "err", text: json.error ?? `Failed (${res.status})` });
        return;
      }
      setSubmitMsg({ kind: "ok", text: `Decision recorded: ${json.decision?.decision ?? decision} — status ${json.previousStatus} → ${json.application?.status}` });
      // soft reload to reflect new status/decisions without full navigation
      setTimeout(() => window.location.reload(), 800);
    } catch (e: any) {
      setSubmitMsg({ kind: "err", text: e?.message ?? "Network error" });
    } finally {
      setSubmitting(false);
    }
  }, [app.id, decision, rationale, overrideChecked, overrideReason, canSubmit]);

  const totalOf = (a: Assessment) => {
    if (a.focus_score == null || a.content_score == null || a.interactivity_score == null || a.credibility_score == null) return "—";
    return String((a.focus_score ?? 0) + (a.content_score ?? 0) + (a.interactivity_score ?? 0) + (a.credibility_score ?? 0));
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Aggregates bar */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ minWidth: 220 }}>
          <div style={{ fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 700 }}>Mean total</div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
            {fmt(aggregates.mean_total)} <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>/ 8 <span style={{ fontWeight: 400, fontSize: 11 }} title={iafBonusMode === "additive" ? "Additive: IAF standing adds to ranking total (max 10)" : "Tiebreak: IAF only breaks ties (max 8)"}>({iafBonusMode})</span></span>
            <span style={{ marginLeft: 8 }}>{qualityBadge(aggregates.qualityStatus)}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            n={aggregates.n} · divergence {fmt(aggregates.divergence)} {aggregates.needsCalibration ? "· needs calibration" : ""} {aggregates.highDivergence ? "· high divergence on focus" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--surface-sunk)", minWidth: 110 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>Focus</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(aggregates.mean_focus)} <span style={{ fontSize: 11, color: "var(--text-faint)" }}>range {fmt(aggregates.range_focus)}</span></div>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--surface-sunk)", minWidth: 110 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>Content</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(aggregates.mean_content)} <span style={{ fontSize: 11, color: "var(--text-faint)" }}>range {fmt(aggregates.range_content)}</span></div>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--surface-sunk)", minWidth: 120 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>Interactivity</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(aggregates.mean_interactivity)} <span style={{ fontSize: 11, color: "var(--text-faint)" }}>range {fmt(aggregates.range_interactivity)}</span></div>
          </div>
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", background: "var(--surface-sunk)", minWidth: 110 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>Credibility</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(aggregates.mean_credibility)} <span style={{ fontSize: 11, color: "var(--text-faint)" }}>range {fmt(aggregates.range_credibility)}</span></div>
          </div>
        </div>
      </div>

      {/* Identity — lead only, and ONLY here (R1 allow-list) */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: 0 }}>Identity — lead only (never shown in scoring)</h2>
        <div style={{ display: "grid", gap: 8, marginTop: 12, fontSize: 13 }}>
          <div><strong>Name</strong> <span style={{ marginLeft: 6 }}>{app.q20_full_name ?? "—"}</span></div>
          <div><strong>Email</strong> <span style={{ marginLeft: 6 }}>{app.q1_email ?? "—"}</span></div>
          {app.q21_bio ? <div><strong>Bio</strong> <span style={{ marginLeft: 6, whiteSpace: "pre-wrap" }}>{app.q21_bio}</span></div> : null}
          <div><strong>Region</strong> <span style={{ marginLeft: 6 }}>{app.q24_region ?? "—"}</span> · <strong>Ethnicity</strong> {app.q25_ethnicity ?? "—"} · <strong>Career</strong> {app.q26_career_stage ?? "—"} · <strong>Under 35</strong> {app.q27_under_35 == null ? "—" : app.q27_under_35 ? "Yes" : "No"} · <strong>Gender</strong> {app.q28_gender ?? "—"}</div>
          <div><strong>Co-facilitators</strong> <span style={{ marginLeft: 6, whiteSpace: "pre-wrap" }}>{app.q23_cofacilitators ?? "—"}</span></div>
          <div><strong>Availability</strong> {chips(app.q3_availability)} <span style={{ marginLeft: 12 }}><strong>Ticket</strong></span> {chips(app.q2_ticket_status)}</div>
          {app.q22_headshot_url ? <div><strong>Headshot</strong> <a href={app.q22_headshot_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{app.q22_headshot_url}</a></div> : null}
          <div><strong>IAF standing</strong> <span style={{ marginLeft: 6 }}>{app.iaf_standing == null ? "—" : app.iaf_standing === 2 ? "2 — IAF member with accreditation" : app.iaf_standing === 1 ? "1 — IAF member" : "0 — Not a member"} </span> <span style={{ color: "var(--text-faint)", fontSize: 12 }}>(q17={app.q17_iaf_member ?? "—"}, q18={app.q18_iaf_qualification ?? "—"})</span></div>
        </div>
      </section>

      {/* Content — round 1 fields */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: 0 }}>Application content</h2>
        <div style={{ display: "grid", gap: 14, marginTop: 14, fontSize: 13 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Q4 Provides</div>
            {chips(app.q4_session_provides, app.q4_session_provides_other)}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Q5 Audience</div>
            {chips(app.q5_audience, app.q5_audience_other)}
            {app.q6_audience_detail ? <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{app.q6_audience_detail}</div> : null}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Q7 About session {app.redacted_q7 ? <span style={{ fontWeight: 400, color: "var(--warn)" }}>(redacted served)</span> : null}</div>
            <div style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-serif)", fontSize: 15, lineHeight: 1.6, maxWidth: "70ch" }}>{app.redacted_q7 ?? app.q7_about_session ?? "—"}</div>
            {app.q7b_benefits || app.redacted_q7b ? (
              <>
                <div style={{ fontWeight: 600, marginTop: 10, marginBottom: 4 }}>Q7b Benefits {app.redacted_q7b ? <span style={{ fontWeight: 400, color: "var(--warn)" }}>(redacted)</span> : null}</div>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{app.redacted_q7b ?? app.q7b_benefits ?? "—"}</div>
              </>
            ) : null}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Q8 Group setup</div>
            {chips(app.q8_group_setup, app.q8_group_setup_other)}
            {app.q9_room_layout ? <div style={{ marginTop: 6 }}>Q9 Room layout: {app.q9_room_layout}</div> : null}
            {app.q9b_furniture ? <div>Q9b Furniture: {app.q9b_furniture}</div> : null}
            <div style={{ marginTop: 6 }}>Q10 Delivery: <strong>{app.q10_delivery_mode ?? "—"}</strong> · Theme: <ThemeBadge theme={app.q11_theme ?? ""} /></div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Q12 Timekeeping</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{app.q12_timekeeping ?? "—"}</div>
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div><strong>Q13 Participation</strong> <span style={{ marginLeft: 6, border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px", background: "var(--surface-sunk)", fontVariantNumeric: "tabular-nums" }}>{app.q13_participation_level ?? "—"}/5 {app.q13_participation_level ? <span style={{ color: "var(--text-faint)" }}>Self-reported by applicant</span> : null}</span></div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Q14 Methods</div>
            {chips(app.q14_methods, app.q14_methods_other)}
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Q15 First ten minutes</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{app.q15_first_ten_minutes ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Q16 Pathway {app.redacted_q16 ? <span style={{ fontWeight: 400, color: "var(--warn)" }}>(redacted)</span> : null}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{app.redacted_q16 ?? app.q16_pathway ?? "—"}</div>
          </div>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Q19 Large groups / English {app.redacted_q19 ? <span style={{ fontWeight: 400, color: "var(--warn)" }}>(redacted)</span> : null}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{app.redacted_q19 ?? app.q19_large_groups_english ?? "—"}</div>
          </div>
        </div>
      </section>

      {/* Every assessment — lead sees all */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: 0 }}>
          Assessments — {assessments.length} total, {submitted.length} submitted
        </h2>
        {assessments.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12 }}>No assessments yet. Assign evaluators to this application.</p>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
            {assessments.map((a) => (
              <div key={a.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: a.state === "submitted" ? "var(--surface)" : "var(--surface-sunk)", opacity: a.state === "recused" ? 0.85 : 1 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{a.evaluator_name} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>· {a.state}</span> {a.state === "submitted" && a.submitted_at ? <span style={{ color: "var(--text-faint)", fontSize: 12 }}>· {new Date(a.submitted_at).toLocaleString()}</span> : null}</div>
                  <div style={{ display: "flex", gap: 6, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px", background: a.focus_no_evidence ? "var(--warn-soft)" : "var(--surface)" }}>F {a.focus_score ?? "—"}{a.focus_no_evidence ? " · no evidence" : ""}</span>
                    <span style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px", background: a.content_no_evidence ? "var(--warn-soft)" : "var(--surface)" }}>C {a.content_score ?? "—"}{a.content_no_evidence ? " · no evidence" : ""}</span>
                    <span style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px", background: a.interactivity_no_evidence ? "var(--warn-soft)" : "var(--surface)" }}>I {a.interactivity_score ?? "—"}{a.interactivity_no_evidence ? " · no evidence" : ""}</span>
                    <span style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px", background: a.credibility_no_evidence ? "var(--warn-soft)" : "var(--surface)" }}>Cr {a.credibility_score ?? "—"}{a.credibility_no_evidence ? " · no evidence" : ""}</span>
                    <span style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "2px 8px", background: "var(--accent-soft)", fontWeight: 700 }}>Σ {totalOf(a)}</span>
                  </div>
                </div>
                {a.state === "recused" && a.private_note ? null : null}
                {a.state === "recused" ? <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)" }}>Recusal reason: {a.feedback_liked ?? a.private_note ?? "—"}</div> : null}
                {a.state !== "recused" && (
                  <div style={{ display: "grid", gap: 6, marginTop: 10, fontSize: 12 }}>
                    <div><strong>Liked:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{a.feedback_liked ?? "—"}</span></div>
                    <div><strong>Improve:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{a.feedback_improve ?? "—"}</span></div>
                    {/* private_note is NEVER shown in aggregated view or here as applicant-facing; show it only labelled as panel-only */}
                    {a.private_note ? <div style={{ color: "var(--text-muted)" }}><strong>Private note (panel only — not in applicant feedback):</strong> <span style={{ whiteSpace: "pre-wrap" }}>{a.private_note}</span></div> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Aggregated applicant feedback — liked + improve concatenated + no-evidence bullets, NO private notes */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: 0 }}>Aggregated applicant feedback — draft</h2>
          <button
            onClick={doCopy}
            style={{ background: copyState === "copied" ? "var(--score-2)" : "var(--accent)", color: "var(--accent-text)", border: "none", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            {copyState === "copied" ? "Copied ✓" : copyState === "error" ? "Copy failed" : "Copy"}
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Concatenated <em>liked</em> + <em>improve</em> from every submitted assessment, plus no-evidence bullets. Private notes are excluded.</p>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-muted)" }}>What we liked</div>
            {feedback.liked.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 6 }}>(no feedback)</div> : (
              <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 13, lineHeight: 1.5 }}>
                {feedback.liked.map((s, i) => <li key={i} style={{ marginBottom: 4, whiteSpace: "pre-wrap" }}>{s}</li>)}
              </ul>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-muted)" }}>What could make this stronger</div>
            {feedback.improve.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 6 }}>(no feedback)</div> : (
              <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 13, lineHeight: 1.5 }}>
                {feedback.improve.map((s, i) => <li key={i} style={{ marginBottom: 4, whiteSpace: "pre-wrap" }}>{s}</li>)}
              </ul>
            )}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-muted)" }}>No evidence provided</div>
            <ul style={{ margin: "6px 0 0 18px", padding: 0, fontSize: 13, lineHeight: 1.5 }}>
              {feedback.noEvidenceBullets.length === 0 ? <li style={{ color: "var(--text-muted)" }}>None flagged</li> : feedback.noEvidenceBullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>Copy preview — exact clipboard text</div>
            <pre style={{ background: "var(--surface-sunk)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 320, overflow: "auto" }}>{feedback.text}</pre>
          </div>
        </div>
      </section>

      {/* Decision controls — lead only */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: 0 }}>Panel decision</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Current status: <strong style={{ color: "var(--text)" }}>{app.status}</strong>. {aggregates.qualityStatus === "below_standard" ? <span style={{ color: "var(--score-0)", fontWeight: 600 }}>Quality: below standard — overriding requires a reason.</span> : <>Quality: {aggregates.qualityStatus}</>}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {DECISIONS.map((d) => (
            <label key={d.value} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: decision === d.value ? "2px solid var(--accent)" : "1px solid var(--border)", borderRadius: 999, padding: "6px 12px", background: decision === d.value ? "var(--accent-soft)" : "var(--surface-sunk)", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              <input type="radio" name="decision" value={d.value} checked={decision === d.value} onChange={() => setDecision(d.value)} style={{ accentColor: "var(--accent)" }} />
              {d.label}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Rationale (required, ≥10 characters)</label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Why this decision? This is audited with the previous status."
            rows={3}
            style={{ width: "100%", marginTop: 6, border: `1px solid ${rationale && !rationaleValid ? "var(--score-0)" : "var(--border)"}`, borderRadius: 10, padding: 10, fontSize: 13, fontFamily: "inherit", background: "var(--surface-sunk)" }}
          />
          {rationale && !rationaleValid ? <div style={{ fontSize: 11, color: "var(--score-0)", marginTop: 4 }}>At least 10 characters required.</div> : null}
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <input id="overrideQuality" type="checkbox" checked={overrideChecked} onChange={(e) => setOverrideChecked(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
          <label htmlFor="overrideQuality" style={{ fontSize: 13, fontWeight: 600 }}>Override quality standard</label>
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>(requires a separate reason, audited)</span>
        </div>
        {overrideChecked ? (
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Override reason (required, ≥10 characters)</label>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Why override the quality gate? This is audited separately."
              rows={2}
              style={{ width: "100%", marginTop: 6, border: `1px solid ${overrideReason && !overrideValid ? "var(--score-0)" : "var(--border)"}`, borderRadius: 10, padding: 10, fontSize: 13, fontFamily: "inherit", background: "var(--surface-sunk)" }}
            />
            {overrideReason && !overrideValid ? <div style={{ fontSize: 11, color: "var(--score-0)", marginTop: 4 }}>At least 10 characters required.</div> : null}
          </div>
        ) : null}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={onSubmitDecision}
            disabled={!canSubmit}
            style={{ background: canSubmit ? "var(--accent)" : "var(--border)", color: canSubmit ? "var(--accent-text)" : "var(--text-faint)", border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed", opacity: canSubmit ? 1 : 0.7 }}
          >
            {submitting ? "Saving…" : "Record decision"}
          </button>
          {submitMsg ? <span style={{ fontSize: 12, color: submitMsg.kind === "ok" ? "var(--score-2)" : "var(--score-0)", fontWeight: 600 }}>{submitMsg.text}</span> : null}
        </div>
      </section>

      {/* Decision history */}
      <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", margin: 0 }}>Decision history ({decisions.length})</h2>
        {decisions.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 8 }}>No decisions yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {decisions.map((d) => (
              <div key={d.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "var(--surface-sunk)", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <strong style={{ textTransform: "capitalize" }}>{d.decision}</strong>
                  <span style={{ color: "var(--text-muted)" }}>{new Date(d.decided_at).toLocaleString()} {d.decided_by_name ? `· by ${d.decided_by_name}` : ""}</span>
                </div>
                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}><strong>Rationale:</strong> {d.rationale ?? "—"}</div>
                {d.override_quality_standard ? <div style={{ marginTop: 4, whiteSpace: "pre-wrap", color: "var(--warn)" }}><strong>Override:</strong> {d.override_reason ?? "—"}</div> : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
