"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import { ThemeBadge } from "@/components/ui/theme-badge";

type Row = {
  id: string;
  wave_id: string;
  wave_name: string | null;
  ref_code: string;
  theme: string | null;
  status: string;
  iaf_standing: number;
  n: number;
  totalAssessments: number;
  submittedCount: number;
  mean_focus: number | null;
  mean_content: number | null;
  mean_interactivity: number | null;
  mean_credibility: number | null;
  mean_total: number | null;
  display_total: number | null;
  normalised_total: number | null;
  divergence: number | null;
  needsCalibration: boolean;
  qualityStatus: string;
  range_focus: number | null;
  range_content: number | null;
  range_interactivity: number | null;
  range_credibility: number | null;
  rank: number;
};

type ApiResponse = {
  applications: Row[];
  total: number;
  iafBonusMode: "additive" | "tiebreak";
  settings: any;
  waves: { id: string; name: string; wave_number: number; status: string }[];
};

type SortKey =
  | "rank"
  | "ref_code"
  | "mean_total"
  | "display_total"
  | "normalised_total"
  | "mean_focus"
  | "mean_content"
  | "mean_interactivity"
  | "mean_credibility"
  | "submitted"
  | "divergence"
  | "qualityStatus";

type SortDir = "asc" | "desc";

function fmt(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(1);
}

function qualityLabel(s: string): { label: string; color: string; bg: string } {
  if (s === "pass") return { label: "Pass", color: "var(--score-2)", bg: "var(--score-2-soft)" };
  if (s === "below_standard") return { label: "Below standard", color: "var(--score-0)", bg: "var(--score-0-soft)" };
  return { label: "Insufficient data", color: "var(--text-muted)", bg: "var(--surface-sunk)" };
}

function divergenceFlag(row: Row) {
  if (row.needsCalibration) {
    return (
      <span
        title={`Divergence ${row.divergence?.toFixed(1) ?? "—"} — max range ≥ 2`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: ".03em",
          textTransform: "uppercase",
          color: "var(--warn)",
          background: "var(--warn-soft)",
          border: "1px solid color-mix(in srgb, var(--warn) 22%, transparent)",
          borderRadius: 999,
          padding: "2px 7px",
        }}
      >
        ● Needs calibration
      </span>
    );
  }
  if (row.divergence !== null) {
    return (
      <span style={{ fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
        {row.divergence.toFixed(1)}
      </span>
    );
  }
  return <span style={{ color: "var(--text-faint)" }}>—</span>;
}

export default function ApplicationsClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters (client-side; server also supports them via query — we keep in sync for shareable URL)
  const [waveFilter, setWaveFilter] = useState<string>("all");
  const [themeFilter, setThemeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [needsCalOnly, setNeedsCalOnly] = useState(false);
  const [belowOnly, setBelowOnly] = useState(false);

  // Sorting — every numeric column sortable, stable
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/applications", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed ${res.status}`);
      }
      const j: ApiResponse = await res.json();
      setData(j);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    let rows = [...data.applications];

    // Client filters combine (AND)
    if (waveFilter !== "all") rows = rows.filter((r) => r.wave_id === waveFilter);
    if (themeFilter !== "all") rows = rows.filter((r) => (r.theme ?? "").toLowerCase() === themeFilter.toLowerCase());
    if (statusFilter !== "all") rows = rows.filter((r) => (r.status ?? "").toLowerCase() === statusFilter.toLowerCase());
    if (needsCalOnly) rows = rows.filter((r) => r.needsCalibration);
    if (belowOnly) rows = rows.filter((r) => r.qualityStatus === "below_standard");

    // Stable sort: keep original index as final tiebreak
    const withIndex = rows.map((r, i) => ({ r, i }));
    const dirMul = sortDir === "asc" ? 1 : -1;

    function numVal(row: Row, key: SortKey): number {
      // map null -> sentinel so nulls sort last regardless of direction
      const sentinel = sortDir === "asc" ? Infinity : -Infinity;
      switch (key) {
        case "rank":
          return row.rank;
        case "mean_total":
          return row.mean_total ?? sentinel;
        case "display_total":
          return row.display_total ?? sentinel;
        case "normalised_total":
          return row.normalised_total ?? sentinel;
        case "mean_focus":
          return row.mean_focus ?? sentinel;
        case "mean_content":
          return row.mean_content ?? sentinel;
        case "mean_interactivity":
          return row.mean_interactivity ?? sentinel;
        case "mean_credibility":
          return row.mean_credibility ?? sentinel;
        case "submitted":
          return row.submittedCount;
        case "divergence":
          return row.divergence ?? sentinel;
        default:
          return sentinel;
      }
    }

    withIndex.sort((a, b) => {
      if (sortKey === "ref_code") {
        const cmp = a.r.ref_code.localeCompare(b.r.ref_code) * dirMul;
        if (cmp !== 0) return cmp;
        return a.i - b.i;
      }
      if (sortKey === "qualityStatus") {
        const order = { pass: 0, below_standard: 1, insufficient_data: 2 } as any;
        const av = order[a.r.qualityStatus] ?? 9;
        const bv = order[b.r.qualityStatus] ?? 9;
        const cmp = (av - bv) * dirMul;
        if (cmp !== 0) return cmp;
        return a.i - b.i;
      }
      // rank is already ranking order; keep it stable, but allow dir flip
      if (sortKey === "rank") {
        const cmp = (a.r.rank - b.r.rank) * dirMul;
        if (cmp !== 0) return cmp;
        return a.i - b.i;
      }
      const av = numVal(a.r, sortKey);
      const bv = numVal(b.r, sortKey);
      if (av !== bv) {
        // careful with Infinity sentinel: we already handle
        if (av === Infinity || av === -Infinity) return 1;
        if (bv === Infinity || bv === -Infinity) return -1;
        return (av - bv) * dirMul;
      }
      // stable tiebreak: rank, then ref_code
      const rc = a.r.rank - b.r.rank;
      if (rc !== 0) return rc;
      return a.i - b.i;
    });

    return withIndex.map((x) => x.r);
  }, [data, waveFilter, themeFilter, statusFilter, needsCalOnly, belowOnly, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // sensible defaults: numeric desc except rank/ref asc
      if (key === "rank" || key === "ref_code" || key === "qualityStatus") setSortDir("asc");
      else setSortDir("desc");
    }
  }

  function SortHead({ k, label, align = "right", title }: { k: SortKey; label: string; align?: "left" | "right" | "center"; title?: string }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        title={title ?? label}
        style={{
          textAlign: align as any,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: ".05em",
          textTransform: "uppercase",
          color: active ? "var(--text)" : "var(--text-muted)",
          background: active ? "var(--surface-sunk)" : "transparent",
          cursor: "pointer",
          userSelect: "none",
          whiteSpace: "nowrap",
          padding: "10px 10px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          {label}
          <span style={{ fontSize: 10, opacity: active ? 1 : 0.35 }}>{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
        </span>
      </th>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 40, maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ height: 18, width: 200, background: "var(--border)", borderRadius: 8, marginBottom: 12 }} />
        <div style={{ height: 40, background: "var(--surface-sunk)", borderRadius: 12, marginBottom: 16 }} />
        <div style={{ height: 400, background: "var(--surface-sunk)", borderRadius: 12 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 20,
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 600 }}>Could not load applications</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>{error}</div>
          <button
            onClick={load}
            style={{
              marginTop: 12,
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // Derive filter options
  const waves = data.waves;
  const themes = ["craft", "clarity", "change", "challenge"];
  const statuses = Array.from(new Set(data.applications.map((r) => r.status))).sort();

  const isEmptyFiltered = filteredAndSorted.length === 0 && data.applications.length > 0;
  const isEmptyUnfiltered = data.applications.length === 0;

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 48px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Applications</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Ranking by mean total ({data.iafBonusMode === "additive" ? "0–10 with IAF additive bonus" : "0–8, IAF tiebreak only"}) · Quality standard on 0–8 ·{" "}
            <span title="Normalised corrects for assessors who score systematically higher or lower than the panel average.">
              Normalised = hawk/dove corrected
            </span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface-sunk)", border: "1px solid var(--border)", borderRadius: 999, padding: "6px 10px" }}>
            {filteredAndSorted.length} of {data.applications.length} shown
          </span>
          <a
            href="/"
            style={{
              fontSize: 13,
              fontWeight: 500,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "7px 12px",
              textDecoration: "none",
              color: "var(--text)",
            }}
          >
            ← Dashboard
          </a>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          marginTop: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 12,
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Wave</span>
          <select
            value={waveFilter}
            onChange={(e) => setWaveFilter(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 13,
            }}
          >
            <option value="all">All waves</option>
            {waves.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Theme</span>
          <select
            value={themeFilter}
            onChange={(e) => setThemeFilter(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 13,
              textTransform: "capitalize",
            }}
          >
            <option value="all">All themes</option>
            {themes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 13,
            }}
          >
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={needsCalOnly} onChange={(e) => setNeedsCalOnly(e.target.checked)} />
          <span>Needs calibration</span>
          <span title="Any criterion with max−min ≥ 2" style={{ color: "var(--text-faint)", fontSize: 11 }}>
            (≥2)
          </span>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
          <input type="checkbox" checked={belowOnly} onChange={(e) => setBelowOnly(e.target.checked)} />
          <span>Below standard</span>
        </label>

        {(waveFilter !== "all" || themeFilter !== "all" || statusFilter !== "all" || needsCalOnly || belowOnly) && (
          <button
            onClick={() => {
              setWaveFilter("all");
              setThemeFilter("all");
              setStatusFilter("all");
              setNeedsCalOnly(false);
              setBelowOnly(false);
            }}
            style={{
              marginLeft: "auto",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--text-muted)",
              background: "var(--surface-sunk)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "6px 12px",
              cursor: "pointer",
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Empty states */}
      {isEmptyUnfiltered ? (
        <div
          style={{
            marginTop: 16,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 28,
            textAlign: "center",
          }}
        >
          <div style={{ fontWeight: 600 }}>No applications yet.</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
            Import a CSV export from the application form to get started.
          </div>
          <a
            href="/admin/import"
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "8px 16px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "var(--accent-text)",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            Go to import
          </a>
        </div>
      ) : isEmptyFiltered ? (
        <div
          style={{
            marginTop: 16,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 28,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          No applications match those filters. Try clearing a filter.
        </div>
      ) : (
        <div
          style={{
            marginTop: 16,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 1100 }}>
              <thead>
                <tr>
                  <SortHead k="rank" label="#" title="Ranking order" align="center" />
                  <SortHead k="ref_code" label="Ref" align="left" />
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      padding: "10px 10px",
                      borderBottom: "1px solid var(--border)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Theme
                  </th>
                  <SortHead k="mean_total" label="Mean total" title="Mean of submitted totals (0–8, or 0–10 in additive mode)" />
                  <SortHead k="normalised_total" label="Normalised" title="Corrects for assessors who score systematically higher or lower than the panel average" />
                  <SortHead k="mean_focus" label="Focus" />
                  <SortHead k="mean_content" label="Content" />
                  <SortHead k="mean_interactivity" label="Interactivity" />
                  <SortHead k="mean_credibility" label="Credibility" />
                  <SortHead k="submitted" label="Assessments" title="Submitted / total assigned" align="center" />
                  <SortHead k="divergence" label="Divergence" align="center" />
                  <SortHead k="qualityStatus" label="Quality" align="center" />
                  <th
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: ".05em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      padding: "10px 10px",
                      borderBottom: "1px solid var(--border)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((row) => {
                  const q = qualityLabel(row.qualityStatus);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => (window.location.href = `/applications/${row.id}`)}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid var(--border)",
                        background: row.needsCalibration ? "color-mix(in srgb, var(--warn-soft) 55%, transparent)" : "transparent",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLTableRowElement).style.background = "var(--surface-sunk)")}
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLTableRowElement).style.background = row.needsCalibration
                          ? "color-mix(in srgb, var(--warn-soft) 55%, transparent)"
                          : "transparent")
                      }
                    >
                      <td style={{ padding: "10px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--text-muted)" }}>
                        {row.rank}
                      </td>
                      <td style={{ padding: "10px 10px", fontWeight: 600, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{row.ref_code}</td>
                      <td style={{ padding: "10px 10px" }}>{row.theme ? <ThemeBadge theme={row.theme} /> : <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
                      <td
                        style={{
                          padding: "10px 10px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 600,
                          background: sortKey === "mean_total" || sortKey === "display_total" ? "var(--surface-sunk)" : "transparent",
                        }}
                      >
                        {fmt(row.display_total)}
                        {data.iafBonusMode === "additive" && row.iaf_standing > 0 && row.mean_total !== null && (
                          <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11, marginLeft: 4 }}>+{row.iaf_standing}</span>
                        )}
                      </td>
                      <td
                        style={{
                          padding: "10px 10px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: "var(--text-muted)",
                          background: sortKey === "normalised_total" ? "var(--surface-sunk)" : "transparent",
                        }}
                        title="Normalised — corrects for hawk/dove assessors"
                      >
                        {fmt(row.normalised_total)}
                      </td>
                      <td
                        style={{
                          padding: "10px 10px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          background: sortKey === "mean_focus" ? "var(--surface-sunk)" : "transparent",
                        }}
                      >
                        {fmt(row.mean_focus)}
                      </td>
                      <td
                        style={{
                          padding: "10px 10px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          background: sortKey === "mean_content" ? "var(--surface-sunk)" : "transparent",
                        }}
                      >
                        {fmt(row.mean_content)}
                      </td>
                      <td
                        style={{
                          padding: "10px 10px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          background: sortKey === "mean_interactivity" ? "var(--surface-sunk)" : "transparent",
                        }}
                      >
                        {fmt(row.mean_interactivity)}
                      </td>
                      <td
                        style={{
                          padding: "10px 10px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          background: sortKey === "mean_credibility" ? "var(--surface-sunk)" : "transparent",
                        }}
                      >
                        {fmt(row.mean_credibility)}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "center", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {row.submittedCount}/{row.totalAssessments || row.n || "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "center" }}>{divergenceFlag(row)}</td>
                      <td style={{ padding: "10px 10px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: ".03em",
                            textTransform: "uppercase",
                            color: q.color,
                            background: q.bg,
                            border: `1px solid color-mix(in srgb, ${q.color} 18%, transparent)`,
                            borderRadius: 999,
                            padding: "2px 7px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {q.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 10px", whiteSpace: "nowrap" }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 500,
                            letterSpacing: ".04em",
                            textTransform: "uppercase",
                            background: "var(--surface-sunk)",
                            border: "1px solid var(--border)",
                            borderRadius: 999,
                            padding: "2px 7px",
                            color: "var(--text-muted)",
                          }}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderTop: "1px solid var(--border)",
              fontSize: 11,
              color: "var(--text-faint)",
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>
              Ranking order: mean total {data.iafBonusMode === "additive" ? "(+ IAF) " : "(IAF tiebreak) "}→ interactivity → content → ref code. Sorted by{" "}
              <strong style={{ color: "var(--text-muted)" }}>{sortKey}</strong> {sortDir === "asc" ? "↑" : "↓"}.
            </span>
            <span>Click a row to open detail. Hover highlights.</span>
          </div>
        </div>
      )}
    </div>
  );
}
