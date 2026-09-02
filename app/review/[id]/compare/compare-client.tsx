"use client";

import { useEffect, useState, useCallback } from "react";
import { computeAggregates, formatMeanForDisplay, type ScoringAssessment } from "@/lib/scoring";
import { CRITERIA } from "@/lib/rubric";

type PanelAssessment = {
  id: string;
  evaluator_id: string;
  evaluator_name: string;
  state: string;
  focus_score: number;
  content_score: number;
  interactivity_score: number;
  credibility_score: number;
  focus_no_evidence: boolean;
  content_no_evidence: boolean;
  interactivity_no_evidence: boolean;
  credibility_no_evidence: boolean;
  feedback_liked: string | null;
  feedback_improve: string | null;
  submitted_at: string | null;
  updated_at: string | null;
};

type PanelResponse = {
  application: { id: string; ref_code: string; wave_id: string; status: string; panel_discussion: string | null };
  settings?: { iaf_bonus_mode: "additive" | "tiebreak" };
  assessments: PanelAssessment[];
  aggregates: {
    n: number;
    mean_focus: number | null;
    mean_content: number | null;
    mean_interactivity: number | null;
    mean_credibility: number | null;
    mean_total: number | null;
    range_focus: number | null;
    range_content: number | null;
    range_interactivity: number | null;
    range_credibility: number | null;
    divergence: number | null;
    qualityStatus: string;
    needsCalibration: boolean;
    highDivergence: boolean;
  };
};

const CRITERION_KEYS = ["focus", "content", "interactivity", "credibility"] as const;
type CKey = (typeof CRITERION_KEYS)[number];

function getScore(a: PanelAssessment, k: CKey): number {
  if (k === "focus") return a.focus_score;
  if (k === "content") return a.content_score;
  if (k === "interactivity") return a.interactivity_score;
  return a.credibility_score;
}
function getMean(agg: PanelResponse["aggregates"], k: CKey): number | null {
  if (k === "focus") return agg.mean_focus;
  if (k === "content") return agg.mean_content;
  if (k === "interactivity") return agg.mean_interactivity;
  return agg.mean_credibility;
}
function getRange(agg: PanelResponse["aggregates"], k: CKey): number | null {
  if (k === "focus") return agg.range_focus;
  if (k === "content") return agg.range_content;
  if (k === "interactivity") return agg.range_interactivity;
  return agg.range_credibility;
}
function getNoEvidence(a: PanelAssessment, k: CKey): boolean {
  if (k === "focus") return a.focus_no_evidence;
  if (k === "content") return a.content_no_evidence;
  if (k === "interactivity") return a.interactivity_no_evidence;
  return a.credibility_no_evidence;
}

export default function CompareClient({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<PanelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ status: number; message: string; code?: string } | null>(null);
  const [discussionDraft, setDiscussionDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const fetchPanel = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/panel`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError({ status: res.status, message: json.error ?? `Request failed (${res.status})`, code: json.code });
        setLoading(false);
        return;
      }
      // Verify mean equals lib/scoring.ts client-side (AC 4)
      // Recompute aggregates from same assessments and compare to server aggregates
      const inputs: ScoringAssessment[] = (json.assessments as PanelAssessment[]).map((a) => ({
        evaluatorId: a.evaluator_id,
        state: a.state,
        focus_score: a.focus_score,
        content_score: a.content_score,
        interactivity_score: a.interactivity_score,
        credibility_score: a.credibility_score,
      }));
      const recomputed = computeAggregates(inputs);
      const server = (json as PanelResponse).aggregates;
      const keys: (keyof typeof recomputed)[] = ["n", "mean_focus", "mean_content", "mean_interactivity", "mean_credibility", "mean_total", "range_focus", "range_content", "range_interactivity", "range_credibility", "divergence"];
      for (const k of keys) {
        const a: any = recomputed[k];
        const b: any = (server as any)[k];
        const eq = a === b || (a === null && b === null) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);
        if (!eq) {
          console.warn(`[compare] mean mismatch on ${k}: recomputed=${a} server=${b} — lib/scoring.ts drift`);
        }
      }
      setData(json as PanelResponse);
    } catch (e: any) {
      setError({ status: 0, message: e?.message ?? "Network error" });
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    fetchPanel();
  }, [fetchPanel]);

  const postComment = async () => {
    if (!discussionDraft.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/panel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: discussionDraft.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPostError(json.error ?? `Failed (${res.status})`);
        setPosting(false);
        return;
      }
      setData(json as PanelResponse);
      setDiscussionDraft("");
    } catch (e: any) {
      setPostError(e?.message ?? "Network error");
    } finally {
      setPosting(false);
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <main style={{ maxWidth: 1100, margin: "32px auto", padding: "0 24px" }}>
        <div style={{ height: 18, width: 180, background: "var(--surface-sunk)", borderRadius: 6, marginBottom: 16 }} />
        <div style={{ height: 28, width: 320, background: "var(--surface-sunk)", borderRadius: 8, marginBottom: 8 }} />
        <div style={{ height: 14, width: 200, background: "var(--surface-sunk)", borderRadius: 6, marginBottom: 24 }} />
        <div style={{ display: "grid", gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: 64, background: "var(--surface-sunk)", borderRadius: 10 }} />
          ))}
        </div>
      </main>
    );
  }

  // 403 — R2 gate
  if (error && error.status === 403) {
    return (
      <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 24px" }}>
        <a href={`/review/${applicationId}`} style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
          ← Back to assessment
        </a>
        <div
          style={{
            marginTop: 24,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--warn-soft)",
              color: "var(--warn)",
              border: "1px solid var(--warn)",
              borderRadius: 999,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            Locked — submit to reveal
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 600, marginTop: 16 }}>Panel scores are hidden until you submit</h1>
          <p style={{ color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6, fontSize: 14 }}>
            You must submit your own assessment for this application before you can see how the rest of the panel
            scored it. This is rule R2 — no score leakage before submission. A lead can always view the panel.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 12, justifyContent: "center" }}>
            <a
              href={`/review/${applicationId}`}
              style={{
                background: "var(--accent)",
                color: "var(--accent-text)",
                padding: "10px 16px",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 500,
                fontSize: 14,
              }}
            >
              Go to assessment →
            </a>
            <button
              onClick={fetchPanel}
              style={{
                border: "1px solid var(--border-strong)",
                background: "var(--surface)",
                padding: "10px 16px",
                borderRadius: 8,
                fontWeight: 500,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
          <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 16 }}>{error.message}</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ maxWidth: 720, margin: "48px auto", padding: "0 24px" }}>
        <a href={`/review/${applicationId}`} style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
          ← Back to assessment
        </a>
        <div
          style={{
            marginTop: 24,
            border: "1px solid var(--danger)",
            background: "var(--danger-soft)",
            borderRadius: 12,
            padding: 24,
          }}
        >
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--danger)" }}>Could not load panel</h1>
          <p style={{ color: "var(--text-muted)", marginTop: 6, fontSize: 14 }}>{error.message}</p>
          <button
            onClick={fetchPanel}
            style={{
              marginTop: 16,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              padding: "8px 14px",
              borderRadius: 8,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { application, assessments, aggregates } = data;
  const hasScores = aggregates.n > 0 && assessments.length > 0;

  return (
    <main style={{ maxWidth: 1100, margin: "32px auto", padding: "0 24px" }}>
      <a href={`/review/${applicationId}`} style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
        ← Back to assessment
      </a>
      <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>
          {application.ref_code} — Panel comparison
        </h1>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "2px 8px",
            background: "var(--surface-sunk)",
          }}
        >
          {aggregates.n} submitted · mean {aggregates.mean_total !== null ? formatMeanForDisplay(aggregates.mean_total) : "—"} / 8
        </span>
        {aggregates.needsCalibration && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--danger)",
              background: "var(--danger-soft)",
              border: "1px solid var(--danger)",
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            Needs calibration
          </span>
        )}
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>
        Means computed via <code style={{ background: "var(--surface-sunk)", padding: "1px 6px", borderRadius: 4 }}>lib/scoring.ts</code> · divergence threshold ≥2 · quality: {aggregates.qualityStatus}
      </p>

      {!hasScores ? (
        <div
          style={{
            marginTop: 24,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600 }}>Not yet scored</h2>
          <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 6 }}>
            No submitted assessments for this application yet. Means and divergence will appear once at least one
            assessor has submitted.
          </p>
        </div>
      ) : (
        <>
          {/* 4×N matrix */}
          <section style={{ marginTop: 24, border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 640 }}>
                <thead>
                  <tr style={{ background: "var(--surface-sunk)", textAlign: "left" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 600, borderBottom: "1px solid var(--border)", minWidth: 200 }}>Criterion</th>
                    {assessments.map((a) => (
                      <th key={a.evaluator_id} style={{ padding: "12px 12px", fontWeight: 600, borderBottom: "1px solid var(--border)", textAlign: "center", minWidth: 110 }}>
                        {a.evaluator_name}
                      </th>
                    ))}
                    <th style={{ padding: "12px 16px", fontWeight: 700, borderBottom: "1px solid var(--border)", textAlign: "center", background: "var(--accent-soft)", minWidth: 90 }}>Mean</th>
                  </tr>
                </thead>
                <tbody>
                  {CRITERIA.map((c) => {
                    const key = c.key as CKey;
                    const range = getRange(aggregates, key);
                    const isDivergent = range !== null && range >= 2;
                    const mean = getMean(aggregates, key);
                    return (
                      <tr key={c.key} style={{ background: isDivergent ? "var(--danger-soft)" : undefined }}>
                        <th
                          style={{
                            padding: "16px",
                            textAlign: "left",
                            fontWeight: 600,
                            borderBottom: "1px solid var(--border)",
                            verticalAlign: "top",
                            borderLeft: isDivergent ? "3px solid var(--danger)" : "3px solid transparent",
                            borderRight: isDivergent ? "3px solid var(--danger)" : "1px solid var(--border)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span>{c.title}</span>
                            {isDivergent && (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 700,
                                  letterSpacing: "0.06em",
                                  textTransform: "uppercase",
                                  color: "var(--danger)",
                                  border: "1px solid var(--danger)",
                                  background: "var(--surface)",
                                  borderRadius: 999,
                                  padding: "1px 7px",
                                }}
                              >
                                Disagreement
                              </span>
                            )}
                          </div>
                          <div style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 12, marginTop: 4, lineHeight: 1.4 }}>{c.question}</div>
                          <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6 }}>
                            range {range !== null ? range : "—"} {isDivergent ? "· max–min ≥2" : ""}
                          </div>
                        </th>
                        {assessments.map((a) => {
                          const score = getScore(a, key);
                          const noEv = getNoEvidence(a, key);
                          return (
                            <td
                              key={a.evaluator_id}
                              style={{
                                padding: "16px 12px",
                                textAlign: "center",
                                borderBottom: "1px solid var(--border)",
                                borderLeft: "1px solid var(--border)",
                                outline: isDivergent ? "2px solid var(--danger)" : undefined,
                                outlineOffset: isDivergent ? -2 : undefined,
                                background: isDivergent ? "var(--surface)" : undefined,
                                verticalAlign: "middle",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: 36,
                                  height: 36,
                                  borderRadius: 8,
                                  fontWeight: 700,
                                  fontSize: 16,
                                  border: `1px solid ${score === 0 ? "var(--score-0)" : score === 1 ? "var(--score-1)" : "var(--score-2)"}`,
                                  background: score === 0 ? "var(--score-0-soft)" : score === 1 ? "var(--score-1-soft)" : "var(--score-2-soft)",
                                  color: score === 0 ? "var(--score-0)" : score === 1 ? "var(--score-1)" : "var(--score-2)",
                                }}
                                aria-label={`${c.title} score ${score}`}
                              >
                                {score}
                              </span>
                              {noEv && (
                                <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 6, lineHeight: 1.2 }}>
                                  no evidence
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td
                          style={{
                            padding: "16px",
                            textAlign: "center",
                            borderBottom: "1px solid var(--border)",
                            borderLeft: "1px solid var(--border)",
                            background: isDivergent ? "var(--danger-soft)" : "var(--accent-soft)",
                            outline: isDivergent ? "2px solid var(--danger)" : undefined,
                            outlineOffset: isDivergent ? -2 : undefined,
                            verticalAlign: "middle",
                            fontWeight: 700,
                            fontSize: 16,
                          }}
                        >
                          {mean !== null ? formatMeanForDisplay(mean) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr style={{ background: "var(--surface-sunk)", fontWeight: 600 }}>
                    <th style={{ padding: "12px 16px", textAlign: "left" }}>Total (0–8) <span style={{ fontWeight: 400, fontSize: 11, color: "var(--text-muted)", textTransform: "none" }}>({(data.settings?.iaf_bonus_mode ?? "additive")})</span></th>
                    {assessments.map((a) => {
                      const total = a.focus_score + a.content_score + a.interactivity_score + a.credibility_score;
                      return (
                        <td key={a.evaluator_id} style={{ padding: "12px", textAlign: "center" }}>
                          {total}
                        </td>
                      );
                    })}
                    <td style={{ padding: "12px 16px", textAlign: "center", background: "var(--accent-soft)", fontWeight: 700 }}>
                      {aggregates.mean_total !== null ? formatMeanForDisplay(aggregates.mean_total) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", background: "var(--surface-sunk)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              Cells outlined in red signal divergence (max–min ≥2 on that criterion). The word <strong style={{ color: "var(--danger)" }}>Disagreement</strong> marks the row. Means are computed by{" "}
              <code style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 4, border: "1px solid var(--border)" }}>lib/scoring.ts#computeAggregates</code> — rounding only for display.
            </div>
          </section>

          {/* Feedback side-by-side */}
          <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>Feedback side-by-side</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
              Each assessor’s two required feedback fields and no-evidence flags. Private notes are never shown here.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${Math.min(assessments.length, 3)}, minmax(0, 1fr))`,
                gap: 16,
                marginTop: 12,
              }}
            >
              {assessments.map((a) => {
                const flags: string[] = [];
                if (a.focus_no_evidence) flags.push("Facilitation Focus — no evidence");
                if (a.content_no_evidence) flags.push("Session Content — no evidence");
                if (a.interactivity_no_evidence) flags.push("Interactivity — no evidence");
                if (a.credibility_no_evidence) flags.push("Credibility — no evidence");
                return (
                  <div
                    key={a.evaluator_id}
                    style={{
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      borderRadius: 12,
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{a.evaluator_name}</span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px", background: "var(--surface-sunk)" }}>
                        {a.focus_score + a.content_score + a.interactivity_score + a.credibility_score} / {(data.settings?.iaf_bonus_mode ?? "additive") === "additive" ? 10 : 8} <span style={{ fontWeight: 400, fontSize: 10 }}>({data.settings?.iaf_bonus_mode ?? "additive"})</span>
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                      Submitted {a.submitted_at ? new Date(a.submitted_at).toLocaleDateString() : "—"}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Liked</div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                          background: "var(--surface-sunk)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "10px 12px",
                          minHeight: 48,
                        }}
                      >
                        {a.feedback_liked ?? <em style={{ color: "var(--text-faint)" }}>—</em>}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                        Could improve
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                          background: "var(--surface-sunk)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "10px 12px",
                          minHeight: 48,
                        }}
                      >
                        {a.feedback_improve ?? <em style={{ color: "var(--text-faint)" }}>—</em>}
                      </div>
                    </div>
                    {flags.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                          No evidence flagged
                        </div>
                        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>
                          {flags.map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Responsive fallback: single column on narrow */}
            <style>{`@media (max-width: 860px){ div[style*="gridTemplateColumns"]{ grid-template-columns: 1fr !important; } }`}</style>
          </section>
        </>
      )}

      {/* Panel discussion thread */}
      <section style={{ marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Panel discussion</h2>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
          Resolve disagreement in writing. Comments are appended to a single free-text{" "}
          <code style={{ background: "var(--surface-sunk)", padding: "1px 5px", borderRadius: 4 }}>panel_discussion</code> field on the
          application, with author and timestamp. Visible to anyone who can view this panel.
        </p>

        <div
          style={{
            marginTop: 12,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 16, maxHeight: 420, overflowY: "auto" }}>
            {!data.application.panel_discussion || data.application.panel_discussion.trim().length === 0 ? (
              <p style={{ color: "var(--text-faint)", fontSize: 14, textAlign: "center", padding: "24px 0", margin: 0 }}>
                No comments yet. Start the discussion below.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {data.application.panel_discussion
                  .split(/\n{2,}/)
                  .filter(Boolean)
                  .map((block, idx) => {
                    const lines = block.split("\n");
                    const header = lines[0]?.startsWith("[") ? lines[0] : null;
                    const body = header ? lines.slice(1).join("\n") : block;
                    return (
                      <div
                        key={idx}
                        style={{
                          border: "1px solid var(--border)",
                          background: "var(--surface-sunk)",
                          borderRadius: 10,
                          padding: "12px 14px",
                        }}
                      >
                        {header && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>{header}</div>}
                        <div style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{body}</div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-sunk)", padding: 16 }}>
            <label htmlFor="panel-comment" style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 6 }}>
              Add a comment
            </label>
            <textarea
              id="panel-comment"
              value={discussionDraft}
              onChange={(e) => setDiscussionDraft(e.target.value)}
              placeholder="Share your calibration notes, propose a resolution…"
              rows={3}
              style={{
                width: "100%",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 14,
                lineHeight: 1.5,
                background: "var(--surface)",
                color: "var(--text)",
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            {postError && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{postError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button
                onClick={postComment}
                disabled={posting || !discussionDraft.trim()}
                style={{
                  background: posting || !discussionDraft.trim() ? "var(--border-strong)" : "var(--accent)",
                  color: "var(--accent-text)",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 16px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: posting || !discussionDraft.trim() ? "not-allowed" : "pointer",
                  opacity: posting || !discussionDraft.trim() ? 0.6 : 1,
                }}
              >
                {posting ? "Posting…" : "Post comment"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div style={{ marginTop: 32, textAlign: "center" }}>
        <a href={`/review/${applicationId}`} style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
          ← Back to assessment
        </a>{" "}
        <span style={{ color: "var(--text-faint)", fontSize: 12 }}>·</span>{" "}
        <a href="/" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none" }}>
          Dashboard
        </a>
      </div>
    </main>
  );
}
