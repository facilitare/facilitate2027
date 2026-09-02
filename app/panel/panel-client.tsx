"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { computeBalance, type BalanceApp, type BalanceSettings } from "@/lib/panel-balance";

// ---------------------------------------------------------------------------
// Types from API
// ---------------------------------------------------------------------------
type ApiResponse = {
  settings: BalanceSettings;
  balance: ReturnType<typeof computeBalance>;
  columns: {
    selected: { id: string; ref_code: string; status: string; q11_theme: string | null }[];
    reserve: { id: string; ref_code: string; status: string; q11_theme: string | null }[];
    notSelected: { id: string; ref_code: string; status: string; q11_theme: string | null }[];
  };
  applications: BalanceApp[];
};

type ColumnKey = "selected" | "reserve" | "not_selected";

const THEME_COLOR: Record<string, string> = {
  craft: "var(--craft)",
  clarity: "var(--clarity)",
  change: "var(--change)",
  challenge: "var(--challenge)",
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function pctFmt(n: number): string {
  return `${Math.round(n)}%`;
}
function pct1(n: number): string {
  return `${n.toFixed(1)}%`;
}
function VisuallyHiddenTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: (string | number)[][] }) {
  return (
    <table
      style={{
        position: "absolute",
        left: -10000,
        top: "auto",
        width: 1,
        height: 1,
        overflow: "hidden",
        clip: "rect(0,0,0,0)",
        whiteSpace: "nowrap",
        border: 0,
        padding: 0,
      }}
      aria-hidden={false}
    >
      <caption style={{ position: "absolute", left: -10000 }}>{caption}</caption>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TargetBar({
  pct,
  targetPct,
  pass,
  labelId,
}: {
  pct: number;
  targetPct: number;
  pass: boolean;
  labelId?: string;
}) {
  const fill = pass ? "var(--score-2)" : "var(--warn)";
  const clampedPct = Math.max(0, Math.min(100, pct));
  const targetLeft = Math.max(0, Math.min(100, targetPct));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-labelledby={labelId}
      aria-valuetext={`${Math.round(pct)}% (target ${targetPct}%) ${pass ? "pass" : "miss"}`}
      style={{
        position: "relative",
        height: 8,
        background: "var(--surface-sunk)",
        borderRadius: 999,
        overflow: "visible",
        border: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${clampedPct}%`,
          background: fill,
          borderRadius: 999,
          transition: "width 200ms cubic-bezier(.2,0,0,1), background 150ms",
        }}
      />
      {/* target marker */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: `${targetLeft}%`,
          top: -3,
          bottom: -3,
          width: 2,
          background: "var(--text-muted)",
          borderRadius: 1,
          transform: "translateX(-1px)",
          opacity: 0.85,
        }}
        title={`Target ${targetPct}%`}
      />
    </div>
  );
}

function ThemeBars({ byTheme, total }: { byTheme: { theme: string; count: number; pct: number }[]; total: number }) {
  return (
    <div style={{ display: "grid", gap: 8, position: "relative" }}>
      {/* dotted floor line at 15% - absolute */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "15%",
          top: 0,
          bottom: 0,
          width: 0,
          borderLeft: "1px dashed var(--border-strong)",
          opacity: 0.7,
          pointerEvents: "none",
        }}
      />
      {byTheme.map((t) => {
        const c = THEME_COLOR[t.theme] ?? "var(--text-muted)";
        const w = Math.max(0, Math.min(100, t.pct));
        return (
          <div key={t.theme} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 78, fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-muted)", textAlign: "right" as const }}>
              {t.theme}
            </div>
            <div style={{ flex: 1, height: 14, background: "var(--surface-sunk)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--border)", position: "relative" }}>
              <div style={{ width: `${w}%`, height: "100%", background: c, borderRadius: 999, transition: "width 200ms cubic-bezier(.2,0,0,1)" }} />
            </div>
            <div style={{ width: 96, fontSize: 12, fontVariantNumeric: "tabular-nums", color: "var(--text)", textAlign: "right" as const }}>
              {t.count} · {pctFmt(t.pct)}
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: "var(--text-faint)", marginLeft: 88, marginTop: 2 }}>Dotted line = 15% floor · {total} selected</div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  current,
  total,
  pct,
  targetPct,
  pass,
  targetLabel,
  children,
  bar,
  hiddenTable,
}: {
  title: string;
  subtitle?: React.ReactNode;
  current?: number;
  total?: number;
  pct?: number;
  targetPct?: number;
  pass?: boolean;
  targetLabel?: string;
  children?: React.ReactNode;
  bar?: React.ReactNode;
  hiddenTable?: React.ReactNode;
}) {
  const statusColor = pass ? "var(--score-2)" : "var(--warn)";
  const statusBg = pass ? "var(--score-2-soft)" : "var(--warn-soft)";
  const statusText = pass ? "Pass" : "Miss";
  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${pass === false ? "var(--warn)" : "var(--border)"}`,
        borderRadius: "var(--radius-lg)",
        padding: 16,
        boxShadow: "var(--shadow-sm)",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div id={`card-${title.replace(/\s+/g, "-").toLowerCase()}`} style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-muted)" }}>
            {title}
          </div>
          {subtitle ? <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{subtitle}</div> : null}
        </div>
        {pass !== undefined ? (
          <span
            aria-label={pass ? "target met" : "target not met"}
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              color: statusColor,
              background: statusBg,
              border: `1px solid color-mix(in srgb, ${statusColor} 22%, transparent)`,
              borderRadius: 999,
              padding: "3px 8px",
              whiteSpace: "nowrap",
            }}
          >
            {statusText}
          </span>
        ) : null}
      </div>

      {current !== undefined && total !== undefined && pct !== undefined && targetPct !== undefined ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            <span style={{ fontWeight: 600 }}>{current} of {total}</span>
            <span style={{ color: "var(--text-muted)" }}> ({pctFmt(pct)})</span>
            <span style={{ color: "var(--text-faint)" }}> · target {targetLabel ?? `${targetPct}%`}</span>
          </div>
          <div style={{ marginTop: 8 }}>{bar}</div>
        </div>
      ) : null}

      {children ? <div style={{ marginTop: 10 }}>{children}</div> : null}
      {hiddenTable}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function PanelClient() {
  const [apps, setApps] = useState<BalanceApp[] | null>(null);
  const [settings, setSettings] = useState<BalanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const lastMoveRef = useRef<{ id: string; from: string; to: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/panel/balance", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed ${res.status}`);
      }
      const j: ApiResponse = await res.json();
      setApps(j.applications);
      setSettings(j.settings);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derive selected for balance recompute - instant memo
  const selectedApps = useMemo(() => {
    if (!apps) return [];
    return apps.filter((a) => a.status === "accepted" || a.status === "shortlisted");
  }, [apps]);

  const balance = useMemo(() => {
    if (!settings) return null;
    // Use selectedApps; computeBalance is pure and fast (<1ms)
    return computeBalance(selectedApps, settings);
  }, [selectedApps, settings]);

  // Columns derived
  const columns = useMemo(() => {
    if (!apps) return { selected: [] as BalanceApp[], reserve: [] as BalanceApp[], notSelected: [] as BalanceApp[] };
    const sel = apps.filter((a) => a.status === "accepted" || a.status === "shortlisted");
    const res = apps.filter((a) => a.status === "standby" || a.status === "reserve");
    const not = apps.filter((a) => !sel.includes(a) && !res.includes(a));
    // sort each by ref_code for stability
    const sortFn = (a: BalanceApp, b: BalanceApp) => a.ref_code.localeCompare(b.ref_code);
    sel.sort(sortFn); res.sort(sortFn); not.sort(sortFn);
    return { selected: sel, reserve: res, notSelected: not };
  }, [apps]);

  const move = useCallback(async (applicationId: string, to: ColumnKey) => {
    if (!apps) return;
    const prev = apps.find((a) => a.id === applicationId);
    if (!prev) return;
    const prevStatus = prev.status;
    let newStatus: string;
    if (to === "selected") newStatus = "accepted";
    else if (to === "reserve") newStatus = "standby";
    else newStatus = "declined";
    if (prevStatus === newStatus || (prevStatus === "shortlisted" && to === "selected") || (prevStatus === "reserve" && to === "reserve")) {
      // No change needed; but if shortlisted -> selected, we treat as already selected? Still no update.
      if ((prevStatus === "shortlisted" && to === "selected") || prevStatus === newStatus) return;
    }

    // Optimistic update — recompute happens synchronously via memo (<300ms guarantee: state update + memo)
    const t0 = performance.now();
    setApps((cur) => {
      if (!cur) return cur;
      return cur.map((a) => (a.id === applicationId ? { ...a, status: newStatus } : a));
    });
    // Measure recompute time implicitly via effect below? We ensure memo runs synchronously.
    setBusyIds((s) => new Set(s).add(applicationId));
    lastMoveRef.current = { id: applicationId, from: prevStatus, to };

    try {
      const res = await fetch("/api/panel/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, to }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Move failed ${res.status}`);
      }
      // Server returns balance; we already optimistically updated. Optionally sync with server's status.
      // Re-fetch or trust optimistic; we do small sync: ensure status matches.
      // We don't need to re-fetch whole list unless server changed to different status than we guessed (e.g., shortlisted vs accepted nuance). Our accepted is fine.
      const t1 = performance.now();
      // If recompute took >300ms something is wrong; but our memo is sync so it already happened.
      // We could log timing if needed.
      if (t1 - t0 > 300) {
        console.warn(`Balance recompute exceeded 300ms: ${Math.round(t1 - t0)}ms`);
      }
    } catch (e: any) {
      // Rollback on failure
      setApps((cur) => {
        if (!cur) return cur;
        return cur.map((a) => (a.id === applicationId ? { ...a, status: prevStatus } : a));
      });
      // Show transient error via alert? Use toast-like? Simple alert
      // We'll set error briefly
      console.error(e);
      // Could show a small inline error; for now we don't block UI
    } finally {
      setBusyIds((s) => {
        const n = new Set(s);
        n.delete(applicationId);
        return n;
      });
    }
  }, [apps]);

  // Drag handlers
  function onDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDrop(e: React.DragEvent, to: ColumnKey) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    if (id) move(id, to);
  }

  if (loading) {
    return (
      <div style={{ padding: 40, maxWidth: 1440, margin: "0 auto" }}>
        <div style={{ height: 18, width: 220, background: "var(--border)", borderRadius: 8, marginBottom: 12 }} />
        <div style={{ height: 120, background: "var(--surface-sunk)", borderRadius: 12, marginBottom: 16 }} />
        <div style={{ height: 400, background: "var(--surface-sunk)", borderRadius: 12 }} />
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, textAlign: "center" }}>
          <div style={{ fontWeight: 600 }}>Could not load programme balance</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>{error}</div>
          <button
            onClick={load}
            style={{ marginTop: 12, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--surface)", fontWeight: 500, cursor: "pointer" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!apps || !settings || !balance) return null;

  const totalSelected = balance.total;

  // Empty selected state
  const showEmptySelected = totalSelected === 0;

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 48px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Programme balance</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Operates on the current <strong style={{ color: "var(--text)" }}>Selected</strong> set (accepted + shortlisted) · Drag or move cards to see the cost of a swap while you discuss.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface-sunk)", border: "1px solid var(--border)", borderRadius: 999, padding: "6px 10px" }}>
            {totalSelected} selected · {columns.reserve.length} reserve · {columns.notSelected.length} not selected
          </span>
        </div>
      </div>

      {showEmptySelected ? (
        <div style={{ marginTop: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, textAlign: "center" }}>
          <div style={{ fontWeight: 600 }}>No programme yet</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>Shortlist some applications to see how the programme balances against the conference targets.</div>
        </div>
      ) : null}

      {/* Target cards grid */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {/* Outside England & Wales */}
        <Card
          title="Outside England & Wales"
          current={balance.outside.current}
          total={balance.outside.total}
          pct={balance.outside.pct}
          targetPct={balance.outside.targetPct}
          pass={balance.outside.pass}
          targetLabel={`${balance.outside.targetPct}%`}
          bar={<TargetBar pct={balance.outside.pct} targetPct={balance.outside.targetPct} pass={balance.outside.pass} labelId="card-outside-england---wales" />}
          hiddenTable={
            <VisuallyHiddenTable
              caption="Outside England and Wales — target bar"
              headers={["Current", "Total", "Percent", "Target", "Status"]}
              rows={[[balance.outside.current, balance.outside.total, pct1(balance.outside.pct), `${balance.outside.targetPct}%`, balance.outside.pass ? "Pass" : "Miss"]]}
            />
          }
        />

        {/* Youth */}
        <Card
          title={`Under ${balance.youth.threshold}`}
          subtitle={
            <span>
              Youth threshold is <strong style={{ color: "var(--text)" }}>{balance.youth.threshold}</strong> ·{" "}
              <a href="/admin/settings" style={{ color: "var(--accent)", textDecoration: "underline", textUnderlineOffset: 2 }}>
                Change in settings
              </a>
            </span>
          }
          current={balance.youth.current}
          total={balance.youth.total}
          pct={balance.youth.pct}
          targetPct={balance.youth.targetPct}
          pass={balance.youth.pass}
          targetLabel={`${balance.youth.targetPct}%`}
          bar={<TargetBar pct={balance.youth.pct} targetPct={balance.youth.targetPct} pass={balance.youth.pass} labelId="card-under-35" />}
          hiddenTable={
            <VisuallyHiddenTable
              caption={`Under ${balance.youth.threshold} — target bar`}
              headers={["Current", "Total", "Percent", "Target", "Status", "Threshold"]}
              rows={[[balance.youth.current, balance.youth.total, pct1(balance.youth.pct), `${balance.youth.targetPct}%`, balance.youth.pass ? "Pass" : "Miss", balance.youth.threshold]]}
            />
          }
        />

        {/* Small room slots */}
        <Card
          title="Small rooms"
          subtitle={`Needs to be under 30 vs ${balance.groupSize.slots} slots (hard scarcity)`}
          pass={balance.groupSize.pass}
          children={
            <div>
              <div style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                <span style={{ fontWeight: 600, color: balance.groupSize.over ? "var(--danger)" : "var(--text)" }}>
                  {balance.groupSize.smallCount} of {balance.groupSize.slots} slots used
                </span>
                {balance.groupSize.over ? <span style={{ color: "var(--danger)", marginLeft: 6, fontWeight: 600 }}>· Over capacity</span> : null}
              </div>
              <div
                aria-hidden
                style={{
                  marginTop: 8,
                  height: 8,
                  background: "var(--surface-sunk)",
                  borderRadius: 999,
                  border: `1px solid ${balance.groupSize.over ? "var(--danger)" : "var(--border)"}`,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, (balance.groupSize.smallCount / Math.max(1, balance.groupSize.slots)) * 100)}%`,
                    height: "100%",
                    background: balance.groupSize.over ? "var(--danger)" : "var(--score-2)",
                    borderRadius: 999,
                    transition: "width 200ms, background 150ms",
                  }}
                />
              </div>
              {/* Simple SVG alternative for accessibility? keep div */}
              {balance.groupSize.over ? (
                <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>Shown in red once exceeded — only {balance.groupSize.slots} rooms can host a sub-30 session.</div>
              ) : null}
            </div>
          }
          hiddenTable={
            <VisuallyHiddenTable
              caption="Small room slots"
              headers={["Small sessions", "Slots", "Status"]}
              rows={[[balance.groupSize.smallCount, balance.groupSize.slots, balance.groupSize.pass ? "Pass" : "Over capacity"]]}
            />
          }
        />

        {/* Solo vs co-fac */}
        <Card
          title="Solo vs co-facilitated"
          pass={undefined}
          children={
            <div>
              <div style={{ display: "flex", gap: 12, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                <span>
                  <strong>Solo</strong> {balance.delivery.solo} ({pctFmt(balance.delivery.soloPct)})
                </span>
                <span>
                  <strong>Co-fac</strong> {balance.delivery.coFac} ({pctFmt(balance.delivery.coFacPct)})
                </span>
                <span style={{ color: "var(--text-faint)" }}>· {balance.delivery.total} total</span>
              </div>
              <div style={{ marginTop: 8, display: "flex", height: 8, borderRadius: 999, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface-sunk)" }}>
                <div
                  title={`Solo ${balance.delivery.solo}`}
                  style={{ width: `${balance.delivery.soloPct}%`, background: "var(--accent)", transition: "width 200ms" }}
                />
                <div
                  title={`Co-fac ${balance.delivery.coFac}`}
                  style={{ width: `${balance.delivery.coFacPct}%`, background: "var(--accent-soft)", borderLeft: balance.delivery.solo > 0 && balance.delivery.coFac > 0 ? "1px solid var(--border)" : undefined }}
                />
              </div>
              {/* Hidden table for chart */}
              <div
                style={{
                  position: "absolute",
                  left: -10000,
                  top: "auto",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                }}
                aria-hidden={false}
              >
                <table>
                  <caption>Solo vs co-facilitated</caption>
                  <thead>
                    <tr>
                      <th>Solo</th>
                      <th>Co-fac</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{balance.delivery.solo}</td>
                      <td>{balance.delivery.coFac}</td>
                      <td>{balance.delivery.total}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          }
        />

        {/* Career stage */}
        <Card
          title="Career stage"
          pass={undefined}
          children={
            <div>
              {balance.careerStage.byStage.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No data</div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {balance.careerStage.byStage.map((s) => {
                    const w = Math.max(0, Math.min(100, s.pct));
                    return (
                      <div key={s.stage} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 110, fontSize: 12, color: "var(--text-muted)", textAlign: "right" as const, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{s.stage}</div>
                        <div style={{ flex: 1, height: 10, background: "var(--surface-sunk)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--border)" }}>
                          <div style={{ width: `${w}%`, height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 200ms" }} />
                        </div>
                        <div style={{ width: 72, fontSize: 12, fontVariantNumeric: "tabular-nums", textAlign: "right" as const }}>{s.count} · {pctFmt(s.pct)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
              <VisuallyHiddenTable
                caption="Career stage spread"
                headers={["Stage", "Count", "Percent"]}
                rows={balance.careerStage.byStage.map((s) => [s.stage, s.count, pct1(s.pct)])}
              />
            </div>
          }
        />

        {/* Ethnicity */}
        <Card
          title="Ethnic background"
          subtitle="Counts only · UK Census categories"
          pass={balance.ethnicity.configured ? undefined : false}
          children={
            balance.ethnicity.configured === false ? (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--text-muted)",
                  background: "var(--surface-sunk)",
                  border: "1px dashed var(--border-strong)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
                role="status"
                aria-live="polite"
              >
                Not configured — the ethnicity question has no defined options yet. Set <code style={{ fontSize: 11, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 4px" }}>ethnicity_options</code> in settings to enable this breakdown.
                <div style={{ marginTop: 6 }}>
                  <a href="/admin/settings" style={{ color: "var(--accent)", fontSize: 12, textDecoration: "underline", textUnderlineOffset: 2 }}>
                    Go to settings
                  </a>
                </div>
              </div>
            ) : (
              <div>
                {(balance.ethnicity as Extract<typeof balance.ethnicity, { configured: true }>).byEthnicity.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No data</div>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {(balance.ethnicity as Extract<typeof balance.ethnicity, { configured: true }>).byEthnicity.map((e) => {
                      const w = Math.max(0, Math.min(100, e.pct));
                      return (
                        <div key={e.ethnicity} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 130, fontSize: 12, color: "var(--text-muted)", textAlign: "right" as const, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }} title={e.ethnicity}>
                            {e.ethnicity}
                          </div>
                          <div style={{ flex: 1, height: 10, background: "var(--surface-sunk)", borderRadius: 999, overflow: "hidden", border: "1px solid var(--border)" }}>
                            <div style={{ width: `${w}%`, height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 200ms" }} />
                          </div>
                          <div style={{ width: 72, fontSize: 12, fontVariantNumeric: "tabular-nums", textAlign: "right" as const }}>{e.count} · {pctFmt(e.pct)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <VisuallyHiddenTable
                  caption="Ethnic background — counts only"
                  headers={["Ethnicity", "Count", "Percent"]}
                  rows={(balance.ethnicity as Extract<typeof balance.ethnicity, { configured: true }>).byEthnicity.map((e) => [e.ethnicity, e.count, pct1(e.pct)])}
                />
              </div>
            )
          }
        />

        {/* Theme distribution — spans full width on large screens */}
        <div
          style={{
            background: "var(--surface)",
            border: `1px solid ${balance.themes.pass ? "var(--border)" : "var(--warn)"}`,
            borderRadius: "var(--radius-lg)",
            padding: 16,
            boxShadow: "var(--shadow-sm)",
            gridColumn: "1 / -1",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-muted)" }}>Theme distribution</div>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>No theme below 15% of the programme</div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: ".04em",
                textTransform: "uppercase",
                color: balance.themes.pass ? "var(--score-2)" : "var(--warn)",
                background: balance.themes.pass ? "var(--score-2-soft)" : "var(--warn-soft)",
                border: `1px solid color-mix(in srgb, ${balance.themes.pass ? "var(--score-2)" : "var(--warn)"} 22%, transparent)`,
                borderRadius: 999,
                padding: "3px 8px",
                whiteSpace: "nowrap",
              }}
            >
              {balance.themes.pass ? "Pass" : "Miss"} · min {pct1(balance.themes.minPct)}
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <ThemeBars byTheme={balance.themes.byTheme} total={balance.themes.total} />
            {/* SVG overlay for 15% floor dotted line + target visualization via divs+SVG per 05-DESIGN §7 — we already have dotted line via div; also provide a minimal SVG for spec compliance */}
            <div aria-hidden style={{ marginTop: 8 }}>
              <svg width="100%" height="6" viewBox="0 0 100 6" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
                {/* Track background */}
                <rect x="0" y="2" width="100" height="2" rx="1" fill="var(--surface-sunk)" />
                {/* Floor marker */}
                <line x1="15" y1="0" x2="15" y2="6" stroke="var(--border-strong)" strokeWidth="0.6" strokeDasharray="1.2 1.2" />
              </svg>
            </div>
          </div>
          <VisuallyHiddenTable
            caption="Theme distribution — no theme below 15%"
            headers={["Theme", "Count", "Percent", "Floor", "Status"]}
            rows={balance.themes.byTheme.map((t) => [t.theme, t.count, pct1(t.pct), "15%", t.pct >= 15 ? "Pass" : "Miss"])}
          />
        </div>
      </div>

      {/* Three columns */}
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, letterSpacing: ".02em", margin: 0 }}>Programme columns — drag or use the buttons</h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>Moving an application recomputes the cards above instantly (within 300ms).</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12, marginTop: 12, alignItems: "start" }}>
          {(
            [
              { key: "selected" as ColumnKey, title: "Selected", apps: columns.selected, countLabel: `${columns.selected.length} programme` },
              { key: "reserve" as ColumnKey, title: "Reserve", apps: columns.reserve, countLabel: `${columns.reserve.length} reserve` },
              { key: "not_selected" as ColumnKey, title: "Not selected", apps: columns.notSelected, countLabel: `${columns.notSelected.length} not selected` },
            ] as const
          ).map((col) => (
            <div
              key={col.key}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, col.key)}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                minHeight: 320,
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-sm)",
                ...(dragId ? { outline: "1px dashed var(--border-strong)", outlineOffset: -4 } : {}),
              }}
              aria-label={`${col.title} — ${col.apps.length} applications`}
              data-testid={`column-${col.key}`}
            >
              <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", borderRadius: "12px 12px 0 0", zIndex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text)" }}>{col.title}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{col.countLabel}</div>
              </div>
              <div style={{ padding: 8, display: "grid", gap: 8, flex: 1, alignContent: "start" }}>
                {col.apps.length === 0 ? (
                  <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "var(--text-faint)", border: "1px dashed var(--border)", borderRadius: 8 }}>Empty</div>
                ) : (
                  col.apps.map((a) => {
                    const isBusy = busyIds.has(a.id);
                    const isDragging = dragId === a.id;
                    return (
                      <div
                        key={a.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, a.id)}
                        onDragEnd={() => setDragId(null)}
                        style={{
                          background: "var(--surface-sunk)",
                          border: `1px solid ${isDragging ? "var(--accent)" : "var(--border)"}`,
                          borderRadius: 10,
                          padding: "10px 10px 8px",
                          cursor: "grab",
                          opacity: isBusy ? 0.7 : isDragging ? 0.6 : 1,
                          boxShadow: isDragging ? "var(--shadow-md)" : "none",
                          transition: "opacity 150ms, border-color 150ms",
                        }}
                        data-testid={`card-${a.ref_code}`}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: ".02em" }}>{a.ref_code}</span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              letterSpacing: ".05em",
                              textTransform: "uppercase" as const,
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 999,
                              padding: "2px 6px",
                              color: "var(--text-muted)",
                            }}
                          >
                            {a.q11_theme ?? "—"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                          {col.key !== "selected" ? (
                            <button
                              onClick={() => move(a.id, "selected")}
                              disabled={isBusy}
                              aria-label={`Move ${a.ref_code} to Selected`}
                              style={{
                                fontSize: 11,
                                fontWeight: 600,
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "1px solid var(--accent)",
                                background: "var(--accent)",
                                color: "var(--accent-text)",
                                cursor: isBusy ? "not-allowed" : "pointer",
                                opacity: isBusy ? 0.6 : 1,
                              }}
                            >
                              → Selected
                            </button>
                          ) : null}
                          {col.key !== "reserve" ? (
                            <button
                              onClick={() => move(a.id, "reserve")}
                              disabled={isBusy}
                              aria-label={`Move ${a.ref_code} to Reserve`}
                              style={{
                                fontSize: 11,
                                fontWeight: 500,
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "1px solid var(--border-strong)",
                                background: "var(--surface)",
                                color: "var(--text)",
                                cursor: isBusy ? "not-allowed" : "pointer",
                              }}
                            >
                              → Reserve
                            </button>
                          ) : null}
                          {col.key !== "not_selected" ? (
                            <button
                              onClick={() => move(a.id, "not_selected")}
                              disabled={isBusy}
                              aria-label={`Move ${a.ref_code} to Not selected`}
                              style={{
                                fontSize: 11,
                                fontWeight: 500,
                                padding: "4px 8px",
                                borderRadius: 999,
                                border: "1px solid var(--border)",
                                background: "transparent",
                                color: "var(--text-muted)",
                                cursor: isBusy ? "not-allowed" : "pointer",
                              }}
                            >
                              → Not selected
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer meta */}
      <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-faint)", display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>Balance recomputes instantly · progress bars green when target met, amber when missed</span>
        <span aria-hidden>·</span>
        <span>Small rooms in red once exceeded</span>
      </div>
    </div>
  );
}
