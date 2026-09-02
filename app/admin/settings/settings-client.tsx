"use client";
import { useEffect, useState, useCallback } from "react";

type SettingsMap = Record<string, unknown>;
type MetaMap = Record<string, { updated_at: string | null; updated_by: string | null }>;

const LABELS: Record<string, { title: string; description: string; help?: string }> = {
  ethnicity_options: {
    title: "Ethnicity options (Q25)",
    description: "Source for the ethnicity breakdown on the programme balance dashboard.",
    help: "This question is still under review by the policy team. It is null until the application form defines the exact wording and options. While null, the panel dashboard shows “Not configured” for Q25. Set it to UK Census (uk_census) to enable the breakdown. A future option will allow a custom list.",
  },
  assessors_per_application: {
    title: "Assessors per application",
    description: "How many evaluators are assigned to each application on the next auto-assign run.",
    help: "Changing this does not re-assign existing applications — only applications imported after the change (or still in ‘imported’ status) use the new number.",
  },
  iaf_bonus_mode: {
    title: "IAF bonus mode",
    description: "Whether IAF membership adds to the total or acts only as a tiebreak.",
    help: "Additive: mean total (0–8) + IAF standing (0–2) = display total 0–10 and ranking uses it. Tiebreak: ranking uses mean total (0–8) then IAF standing as the second sort key. Every screen showing a total states which mode is active.",
  },
  session_minutes: {
    title: "Session minutes",
    description: "Length of one conference session, shown as a reminder on the review screen.",
    help: "The left column on every review screen begins with: “The session slot is {n} minutes, including the host's introduction and close.”",
  },
  small_room_slots: {
    title: "Small-room slots",
    description: "Venue capacity for sessions that need a small room (group size “Needs to be under 30”).",
  },
  youth_threshold: {
    title: "Youth threshold (years)",
    description: "Age below which an applicant counts for the youth target. Matches Q27 “Are you under 35?”.",
  },
  target_outside_england_wales_pct: {
    title: "Target — outside England & Wales (%)",
    description: "Programme balance target for lead hosts outside England and Wales.",
  },
  target_youth_pct: {
    title: "Target — youth (%)",
    description: "Programme balance target for hosts under the youth threshold.",
  },
  quality_min_mean_total: {
    title: "Quality — min mean total",
    description: "Quality gate on the mean total (0–8). Below this is below_standard.",
  },
  quality_min_mean_criterion: {
    title: "Quality — min mean per criterion",
    description: "Every criterion mean must be at least this to pass.",
  },
  divergence_threshold: {
    title: "Divergence threshold",
    description: "Range that triggers the disagreement flag (max−min across assessors).",
  },
  normalisation_min_submissions: {
    title: "Normalisation — min submissions",
    description: "An assessor must have at least this many submitted assessments before hawk/dove correction applies.",
  },
};

const ORDER: string[] = [
  "ethnicity_options",
  "assessors_per_application",
  "iaf_bonus_mode",
  "session_minutes",
  "small_room_slots",
  "youth_threshold",
  "target_outside_england_wales_pct",
  "target_youth_pct",
  "quality_min_mean_total",
  "quality_min_mean_criterion",
  "divergence_threshold",
  "normalisation_min_submissions",
];

export default function SettingsClient() {
  const [settings, setSettings] = useState<SettingsMap | null>(null);
  const [meta, setMeta] = useState<MetaMap | null>(null);
  const [draft, setDraft] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Failed ${res.status}`);
      setSettings(j.settings);
      setMeta(j.meta);
      setDraft({ ...j.settings });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const hasChange = (k: string) => {
    if (!settings) return false;
    return JSON.stringify((draft as any)[k]) !== JSON.stringify((settings as any)[k]);
  };
  const anyChange = ORDER.some(hasChange);

  async function saveOne(key: string) {
    if (!hasChange(key)) return;
    setSaving(key);
    setSaveError((s) => ({ ...s, [key]: "" }));
    try {
      const body: Record<string, unknown> = { [key]: (draft as any)[key] };
      // number coercion for fields that come from text inputs
      if (["assessors_per_application","session_minutes","small_room_slots","youth_threshold","target_outside_england_wales_pct","target_youth_pct","divergence_threshold","normalisation_min_submissions"].includes(key)) {
        const v: any = body[key];
        if (typeof v === "string") {
          const n = v.trim() === "" ? null : Number(v);
          body[key] = n;
        }
      }
      // floats
      if (["quality_min_mean_total","quality_min_mean_criterion"].includes(key)) {
        const v: any = body[key];
        if (typeof v === "string") body[key] = v.trim() === "" ? null : Number(v);
      }
      // ethnicity_options special: allow user to type JSON
      if (key === "ethnicity_options") {
        const v: any = body[key];
        if (typeof v === "string") {
          const t = v.trim();
          if (t === "" || t.toLowerCase() === "null" || t.toLowerCase() === "not configured") body[key] = null;
          else if (t === "uk_census") body[key] = "uk_census";
          else {
            // try JSON parse if looks like array
            if (t.startsWith("[") ) {
              try { body[key] = JSON.parse(t); } catch { body[key] = t; }
            } else body[key] = t;
          }
        }
      }

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Save failed ${res.status}${j.details ? ": "+JSON.stringify(j.details) : ""}`);
      // update local settings
      setSettings((prev) => ({ ...(prev ?? {}), [key]: (body as any)[key] }));
      setDraft((prev) => ({ ...prev, [key]: (body as any)[key] }));
      setSaved((s) => ({ ...s, [key]: "Saved — audited" }));
      setTimeout(() => setSaved((s) => { const c = { ...s }; delete c[key]; return c; }), 2500);
    } catch (e: any) {
      setSaveError((s) => ({ ...s, [key]: e.message }));
    } finally {
      setSaving(null);
    }
  }

  async function saveAll() {
    if (!settings) return;
    const changedKeys = ORDER.filter(hasChange);
    for (const k of changedKeys) {
      await saveOne(k);
    }
  }

  function resetOne(key: string) {
    if (!settings) return;
    setDraft((d) => ({ ...d, [key]: (settings as any)[key] }));
    setSaveError((s) => { const c = { ...s }; delete c[key]; return c; });
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ height: 20, width: 200, background: "var(--border)", borderRadius: 8, marginBottom: 12 }} />
        <div style={{ height: 14, background: "var(--surface-sunk)", borderRadius: 8 }} />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ maxWidth: 860, margin: "48px auto", padding: "0 24px" }}>
        <div style={{ background: "var(--danger-soft)", border: "1px solid var(--danger)", borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 600, color: "var(--danger)" }}>Could not load settings</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>{error}</div>
          <button onClick={load} style={{ marginTop: 12, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)" }}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px 48px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Settings</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>Every change is audited with the previous and new value. Changes take effect immediately — next auto-assign, totals, and balance recompute.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin/evaluators" style={{ fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", background: "var(--surface)", textDecoration: "none", color: "var(--text)" }}>Evaluators →</a>
          <a href="/panel" style={{ fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", background: "var(--surface)", textDecoration: "none", color: "var(--text)" }}>Panel dashboard →</a>
        </div>
      </div>

      {anyChange && (
        <div style={{ marginTop: 16, background: "var(--warn-soft)", border: "1px solid var(--warn)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--warn)" }}>{ORDER.filter(hasChange).length} unsaved change(s)</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setDraft({ ...(settings as any) })} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}>Reset all</button>
            <button onClick={saveAll} disabled={!!saving} style={{ fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-text)", border: "none", cursor: "pointer", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save changed"}</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, display: "grid", gap: 14 }}>
        {ORDER.map((key) => {
          const info = LABELS[key];
          const isFirst = key === "ethnicity_options";
          const current = (settings as any)[key];
          const draftVal: any = (draft as any)[key];
          const changed = hasChange(key);
          const isSaving = saving === key;
          const isEthnicity = key === "ethnicity_options";
          const isIaf = key === "iaf_bonus_mode";
          const isNumber = typeof draftVal === "number" || ["assessors_per_application","session_minutes","small_room_slots","youth_threshold","target_outside_england_wales_pct","target_youth_pct","quality_min_mean_total","quality_min_mean_criterion","divergence_threshold","normalisation_min_submissions"].includes(key);

          return (
            <div
              key={key}
              style={{
                background: isFirst ? "color-mix(in srgb, var(--accent-soft) 55%, var(--surface))" : "var(--surface)",
                border: isFirst ? "1.5px solid var(--accent)" : changed ? "1.5px solid var(--warn)" : "1px solid var(--border)",
                borderRadius: 12,
                padding: 16,
                boxShadow: "var(--shadow-sm)",
                position: "relative",
              }}
            >
              {isFirst && (
                <div style={{ position: "absolute", top: -10, left: 16, background: "var(--accent)", color: "var(--accent-text)", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", borderRadius: 999, padding: "2px 8px" }}>
                  Resolve first · policy note below
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{info?.title ?? key}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.5 }}>{info?.description}</div>
                  {info?.help && (
                    <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", background: "var(--surface-sunk)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
                      {info.help}
                    </div>
                  )}
                  {meta && meta[key]?.updated_at && (
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 8 }}>Last change {new Date(meta[key].updated_at as string).toLocaleString()} · <code style={{ background: "var(--surface-sunk)", padding: "1px 4px", borderRadius: 4 }}>{key}</code></div>
                  )}
                </div>
                <div style={{ minWidth: 220, display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" }}>
                  {isIaf ? (
                    <select
                      value={String(draftVal ?? "additive")}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13 }}
                    >
                      <option value="additive">additive (0–10, IAF adds to total)</option>
                      <option value="tiebreak">tiebreak (0–8, IAF is tiebreak only)</option>
                    </select>
                  ) : isEthnicity ? (
                    <select
                      value={draftVal === null || draftVal === undefined || draftVal === "" ? "__null" : String(draftVal)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__null") setDraft((d) => ({ ...d, [key]: null }));
                        else if (v === "uk_census") setDraft((d) => ({ ...d, [key]: "uk_census" }));
                        else setDraft((d) => ({ ...d, [key]: v }));
                      }}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13 }}
                    >
                      <option value="__null">Not configured (null) — panel shows Not configured</option>
                      <option value="uk_census">UK Census (uk_census) — panel shows breakdown</option>
                    </select>
                  ) : isNumber ? (
                    <input
                      type="number"
                      value={draftVal ?? ""}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") setDraft((d) => ({ ...d, [key]: "" as any }));
                        else {
                          const n = Number(raw);
                          setDraft((d) => ({ ...d, [key]: isNaN(n) ? (raw as any) : n }));
                        }
                      }}
                      step={key.includes("quality") ? 0.1 : 1}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13 }}
                    />
                  ) : (
                    <input
                      value={String(draftVal ?? "")}
                      onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                      style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13 }}
                    />
                  )}

                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => saveOne(key)}
                      disabled={!changed || isSaving}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: 8,
                        border: "none",
                        background: changed ? "var(--accent)" : "var(--border)",
                        color: changed ? "var(--accent-text)" : "var(--text-faint)",
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: changed ? "pointer" : "default",
                        opacity: isSaving ? 0.6 : 1,
                      }}
                    >
                      {isSaving ? "Saving…" : changed ? "Save" : "Saved"}
                    </button>
                    {changed && (
                      <button
                        onClick={() => resetOne(key)}
                        style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-sunk)", fontSize: 12, cursor: "pointer" }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  {changed && (
                    <div style={{ fontSize: 11, color: "var(--warn)" }}>
                      Changed: <code style={{ background: "var(--warn-soft)", padding: "1px 4px", borderRadius: 4 }}>{JSON.stringify(current)}</code> → <code style={{ background: "var(--warn-soft)", padding: "1px 4px", borderRadius: 4 }}>{JSON.stringify(draftVal)}</code>
                    </div>
                  )}
                  {saved[key] && <div style={{ fontSize: 11, color: "var(--score-2)", fontWeight: 600 }}>{saved[key]}</div>}
                  {saveError[key] && <div style={{ fontSize: 11, color: "var(--danger)" }}>{saveError[key]}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 20, fontSize: 11, color: "var(--text-faint)", textAlign: "center" }}>
        Settings stored in <code style={{ background: "var(--surface-sunk)", padding: "1px 4px", borderRadius: 4 }}>settings</code> table as jsonb · audited via <code style={{ background: "var(--surface-sunk)", padding: "1px 4px", borderRadius: 4 }}>audit_log</code> · session {`{settings.session_minutes}`} drives review reminder, {`{settings.ethnicity_options}`} drives Q25 card.
      </div>
    </div>
  );
}
