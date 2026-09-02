"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Evaluator = { id: string; name: string; email?: string; role?: string };
type AppRow = { id: string; ref_code: string; q11_theme: string | null; status: string; is_calibration: boolean; wave_id: string };
type Stats = {
  totalApplications: number;
  totalAssessments: number;
  actualAssessments: number;
  submitted: number;
  outstanding: number;
  ready: boolean;
  outstandingList: { evaluatorId: string; evaluatorName: string; outstandingCount: number }[];
};
type Comparison = {
  panelMean: { focus: number; content: number; interactivity: number; credibility: number };
  perAssessor: {
    evaluatorId: string;
    evaluatorName: string;
    count: number;
    means: { focus: number; content: number; interactivity: number; credibility: number };
    deviations: { focus: string; content: string; interactivity: string; credibility: string };
    deviationNums: { focus: number; content: number; interactivity: number; credibility: number };
  }[];
  totalSubmitted: number;
};

type ApiResponse = {
  evaluators: Evaluator[];
  calibrationApps: AppRow[];
  allApps: AppRow[];
  calibrationIds: string[];
  stats: Stats;
  comparison: Comparison | null;
};

const CRITERIA = ["focus", "content", "interactivity", "credibility"] as const;
const CRITERION_LABELS: Record<string, string> = {
  focus: "Facilitation Focus",
  content: "Session Content",
  interactivity: "Interactivity",
  credibility: "Credibility & Experience",
};

function deviationStyle(v: number): React.CSSProperties {
  if (v > 0.3) return { color: "var(--score-2)", fontWeight: 600 };
  if (v < -0.3) return { color: "var(--danger)", fontWeight: 600 };
  return { color: "var(--text-muted)", fontWeight: 500 };
}

export default function CalibrationClient({ leadName }: { leadName: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/calibration", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Failed ${res.status}`);
      setData(j);
      setSelected(new Set(j.calibrationIds ?? []));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleOne = useCallback(
    async (appId: string, currentlyCalibrated: boolean) => {
      setSaving(appId);
      try {
        const res = await fetch("/api/calibration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ applicationId: appId, isCalibration: !currentlyCalibrated }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? `Failed ${res.status}`);
        setData(j);
        setSelected(new Set(j.calibrationIds ?? []));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setSaving(null);
      }
    },
    []
  );

  const applyBulk = useCallback(async () => {
    setBulkBusy(true);
    setError(null);
    try {
      const ids = [...selected];
      const res = await fetch("/api/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationIds: ids }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Failed ${res.status}`);
      setData(j);
      setSelected(new Set(j.calibrationIds ?? []));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBulkBusy(false);
    }
  }, [selected]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dirty = useMemo(() => {
    if (!data) return false;
    const a = new Set(data.calibrationIds);
    if (a.size !== selected.size) return true;
    for (const id of selected) if (!a.has(id)) return true;
    return false;
  }, [data, selected]);

  if (loading) {
    return (
      <main style={{ maxWidth: 1060, margin: "24px auto", padding: "0 24px 40px" }}>
        <div style={{ height: 18, width: 200, background: "var(--border)", borderRadius: 8, marginBottom: 12 }} />
        <div style={{ height: 14, width: 360, background: "var(--surface-sunk)", borderRadius: 8 }} />
        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          <div style={{ height: 120, background: "var(--surface-sunk)", borderRadius: 12 }} />
          <div style={{ height: 200, background: "var(--surface-sunk)", borderRadius: 12 }} />
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main style={{ maxWidth: 1060, margin: "24px auto", padding: "0 24px 40px" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, textAlign: "center" }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Could not load calibration</h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>{error}</p>
          <button
            onClick={() => load()}
            style={{ marginTop: 14, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-sunk)", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { evaluators, allApps, calibrationApps, stats, comparison } = data;

  return (
    <main style={{ maxWidth: 1060, margin: "24px auto", padding: "0 24px 40px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Calibration mode</h1>
        <span style={{ fontSize: 12, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px", background: "var(--surface-sunk)" }}>
          Lead · {leadName}
        </span>
        {stats.totalApplications > 0 && (
          <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
            · {stats.totalApplications} application{stats.totalApplications !== 1 ? "s" : ""} · {evaluators.length} active evaluators · {stats.totalAssessments} expected assessments
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, maxWidth: 68 * 8, lineHeight: 1.5 }}>
        Mark a small set of applications as the calibration set. Each will be assigned to <strong style={{ color: "var(--text)" }}>all {evaluators.length} active evaluators</strong> regardless of the{" "}
        <code style={{ background: "var(--surface-sunk)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px", fontSize: 12 }}>assessors_per_application</code> setting. The comparison view is withheld until every assessor has submitted.
      </p>

      {error && (
        <div style={{ marginTop: 14, background: "var(--danger-soft)", border: "1px solid var(--danger)", color: "var(--danger)", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Summary cards */}
      {stats.totalApplications > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 18 }}>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Calibration set</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{stats.totalApplications} · {calibrationApps.map((a) => a.ref_code).join(", ")}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{stats.submitted} / {stats.totalAssessments} submitted</div>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Outstanding</div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums", color: stats.outstanding === 0 ? "var(--score-2)" : "var(--warn)" }}>
              {stats.outstanding}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
              {stats.ready ? "All submitted — comparison ready" : `${stats.outstandingList.length} assessor${stats.outstandingList.length !== 1 ? "s" : ""} still to submit`}
            </div>
          </div>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Active evaluators</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6, lineHeight: 1.5 }}>{evaluators.map((e) => e.name).join(" · ")}</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>Calibration assigns to all of these, regardless of per-application setting.</div>
          </div>
        </div>
      )}

      {/* Comparison / withheld */}
      {stats.totalApplications > 0 && (
        <section style={{ marginTop: 18 }}>
          {!stats.ready ? (
            <div
              style={{
                background: "var(--warn-soft)",
                border: "1px solid color-mix(in srgb, var(--warn) 22%, transparent)",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--warn)" }}>Comparison withheld — {stats.outstanding} outstanding</div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                Every assessor must submit for every calibration application before the panel comparison is shown. This prevents anchoring.
              </p>
              {stats.outstandingList.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>Outstanding assessors:</div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--text)" }}>
                    {stats.outstandingList.map((o) => (
                      <li key={o.evaluatorId}>
                        <strong>{o.evaluatorName}</strong> — {o.outstandingCount} assessment{o.outstandingCount !== 1 ? "s" : ""} outstanding
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-faint)" }}>
                {stats.submitted} of {stats.totalAssessments} submitted · {stats.totalApplications} calibration application{stats.totalApplications !== 1 ? "s" : ""} × {evaluators.length} evaluators
              </div>
            </div>
          ) : comparison ? (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Calibration comparison — severity calibration</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                    Per-assessor mean per criterion vs panel mean · signed deviation to 1 decimal · {comparison.totalSubmitted} submitted assessments
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", background: "var(--score-2-soft)", color: "var(--score-2)", border: "1px solid color-mix(in srgb, var(--score-2) 22%, transparent)", borderRadius: 999, padding: "4px 8px" }}>
                  Ready — all submitted
                </span>
              </div>

              {/* Panel mean row */}
              <div style={{ padding: "10px 16px", background: "var(--surface-sunk)", borderBottom: "1px solid var(--border)", display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>Panel mean</span>
                {CRITERIA.map((k) => (
                  <span key={k} style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: "var(--text-faint)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", marginRight: 4 }}>{k}</span>
                    <strong>{comparison.panelMean[k].toFixed(1)}</strong>
                  </span>
                ))}
              </div>

              {/* Table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-sunk)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)", whiteSpace: "nowrap" }}>Assessor</th>
                      {CRITERIA.map((k) => (
                        <th key={k} style={{ padding: "10px 8px", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-faint)", textAlign: "center", minWidth: 120 }}>
                          {CRITERION_LABELS[k]}
                        </th>
                      ))}
                      <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)", textAlign: "center" }}>n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.perAssessor.map((row) => (
                      <tr key={row.evaluatorId} style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 600, whiteSpace: "nowrap" }}>{row.evaluatorName}</td>
                        {CRITERIA.map((k) => {
                          const meanVal = row.means[k as keyof typeof row.means];
                          const devStr = row.deviations[k as keyof typeof row.deviations];
                          const devNum = row.deviationNums[k as keyof typeof row.deviationNums];
                          return (
                            <td key={k} style={{ padding: "10px 8px", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                              <span style={{ fontWeight: 600 }}>{meanVal.toFixed(1)}</span>
                              <span style={{ marginLeft: 8, fontSize: 12, ...deviationStyle(devNum) }}>{devStr}</span>
                            </td>
                          );
                        })}
                        <td style={{ padding: "10px 12px", textAlign: "center", fontVariantNumeric: "tabular-nums", color: "var(--text-muted)" }}>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ padding: "10px 16px", background: "var(--surface-sunk)", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-faint)", lineHeight: 1.5 }}>
                Signed deviation = assessor mean − panel mean, to 1 decimal. Positive = more generous than panel; negative = more severe. Highlight thresholds ±0.3.
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* Picker — mark calibration set */}
      <section style={{ marginTop: 22, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Choose calibration set</h2>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0", lineHeight: 1.4 }}>
              Recommended: 2–3 applications. Each selected application will immediately be assigned to all {evaluators.length} active evaluators.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
              {selected.size} selected{dirty ? " · unsaved" : ""}
            </span>
            <button
              onClick={applyBulk}
              disabled={!dirty || bulkBusy}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid var(--border-strong)",
                background: dirty ? "var(--accent)" : "var(--surface-sunk)",
                color: dirty ? "var(--accent-text)" : "var(--text-faint)",
                fontWeight: 600,
                fontSize: 13,
                cursor: dirty ? "pointer" : "not-allowed",
                opacity: bulkBusy ? 0.7 : 1,
              }}
            >
              {bulkBusy ? "Saving…" : "Apply selection"}
            </button>
          </div>
        </div>

        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead style={{ position: "sticky", top: 0, background: "var(--surface-sunk)", zIndex: 1 }}>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "8px 12px", width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === allApps.length && allApps.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set(allApps.map((a) => a.id)));
                      else setSelected(new Set());
                    }}
                    aria-label="Select all"
                  />
                </th>
                <th style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Ref</th>
                <th style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Theme</th>
                <th style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Status</th>
                <th style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Calibration</th>
                <th style={{ padding: "8px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)", textAlign: "right" }}>Toggle</th>
              </tr>
            </thead>
            <tbody>
              {allApps.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 20, textAlign: "center", color: "var(--text-muted)" }}>
                    No applications yet. Import a CSV first.
                  </td>
                </tr>
              ) : (
                allApps.map((app) => {
                  const isCal = !!app.is_calibration;
                  const isSelected = selected.has(app.id);
                  const isSaving = saving === app.id;
                  return (
                    <tr key={app.id} style={{ borderBottom: "1px solid var(--border)", background: isCal ? "var(--accent-soft)" : "var(--surface)" }}>
                      <td style={{ padding: "8px 12px" }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(app.id)} aria-label={`Select ${app.ref_code}`} />
                      </td>
                      <td style={{ padding: "8px 12px", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                        {app.ref_code}
                        {isCal && (
                          <span
                            title="Calibration set"
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              fontWeight: 600,
                              letterSpacing: ".04em",
                              textTransform: "uppercase",
                              background: "var(--accent)",
                              color: "var(--accent-text)",
                              borderRadius: 999,
                              padding: "2px 6px",
                            }}
                          >
                            CAL
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", color: "var(--text-muted)", textTransform: "capitalize" }}>{app.q11_theme ?? "—"}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "var(--text-muted)" }}>{app.status}</td>
                      <td style={{ padding: "8px 12px" }}>
                        {isCal ? (
                          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--accent)", background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: 999, padding: "2px 7px" }}>
                            Calibration
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: "var(--text-faint)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        <button
                          onClick={() => toggleOne(app.id, isCal)}
                          disabled={isSaving}
                          title={isCal ? "Remove from calibration set" : "Mark as calibration — assigns to all active evaluators"}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 8,
                            border: isCal ? "1px solid var(--danger)" : "1px solid var(--border-strong)",
                            background: isCal ? "var(--danger-soft)" : "var(--surface)",
                            color: isCal ? "var(--danger)" : "var(--text)",
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: isSaving ? "wait" : "pointer",
                            opacity: isSaving ? 0.6 : 1,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {isSaving ? "…" : isCal ? "Remove" : "Mark calibration"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {allApps.length > 0 && (
          <div style={{ padding: "10px 16px", background: "var(--surface-sunk)", borderTop: "1px solid var(--border)", fontSize: 12, color: "var(--text-faint)", lineHeight: 1.5, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span>Marking assigns immediately to all {evaluators.length} active evaluators. Unmarking keeps existing assignments.</span>
            <a href="/applications" style={{ color: "var(--text-muted)", textDecoration: "underline", textUnderlineOffset: 2 }}>
              Go to ranking →
            </a>
          </div>
        )}
      </section>

      <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          onClick={() => load()}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
        >
          Refresh
        </button>
        <a
          href="/"
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-sunk)", color: "var(--text)", textDecoration: "none", fontSize: 13, fontWeight: 500 }}
        >
          ← Dashboard
        </a>
      </div>
    </main>
  );
}
