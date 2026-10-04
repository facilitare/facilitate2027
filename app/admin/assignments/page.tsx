"use client";
import { useEffect, useState } from "react";

type App = { id: string; ref_code: string; session_title: string | null; status: string; anonymity_flag: boolean; anonymity_notes: string | null };
type Asmt = { id: string; application_id: string; evaluator_id: string; state: string };
type Ev = { id: string; name: string; role: string };

const STATE_LABEL: Record<string, string> = { assigned: "Assigned", draft: "In progress", submitted: "Submitted ✓", recused: "Recused" };

export default function AssignmentsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [asmts, setAsmts] = useState<Asmt[]>([]);
  const [evs, setEvs] = useState<Ev[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/assignments", { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) { setError(j.error ?? "Could not load"); return; }
    setApps(j.applications); setAsmts(j.assessments); setEvs(j.evaluators); setError(null);
  }
  useEffect(() => { load(); }, []);

  const find = (appId: string, evId: string) => asmts.find((a) => a.application_id === appId && a.evaluator_id === evId);

  async function assign(appId: string, evId: string) {
    const res = await fetch("/api/assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId: appId, evaluatorId: evId }) });
    if (!res.ok && res.status !== 409) throw new Error((await res.json()).error ?? "Assign failed");
    return res.ok;
  }

  async function toggle(app: App, ev: Ev) {
    setBusy(true); setMsg(null);
    try {
      const a = find(app.id, ev.id);
      if (a) {
        const res = await fetch(`/api/assignments/${a.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error((await res.json()).error ?? "Remove failed");
      } else {
        await assign(app.id, ev.id);
      }
      await load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  async function assignEveryone() {
    if (!confirm("Give every application to every assessor? (Used for the practice round.)")) return;
    setBusy(true); setMsg(null);
    let n = 0;
    try {
      for (const app of apps) {
        for (const ev of evs.filter((e) => e.role === "assessor")) {
          if (!find(app.id, ev.id) && (await assign(app.id, ev.id))) n++;
        }
      }
      setMsg(`${n} new assignment(s) created.`);
      await load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  const btn: React.CSSProperties = { padding: "12px 20px", borderRadius: 10, fontSize: 15, fontWeight: 600, background: "var(--accent)", color: "var(--accent-text)", border: "none", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "32px 16px 120px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gap: 16 }}>
        <a href="/" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>← Back to dashboard</a>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Assignments</h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>Tick a box to give an application to an assessor; untick to take it back (not possible once they have submitted). Assessors see their applications on their dashboard straight away.</p>
        {error ? <div style={{ padding: 14, borderRadius: 10, background: "var(--danger-soft)", color: "var(--danger)" }}>{error}</div> : null}

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={assignEveryone} disabled={busy || !apps.length} style={btn}>Give all applications to all assessors</button>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>👈 quickest for the practice round</span>
          {msg ? <span style={{ fontSize: 13, fontWeight: 600 }}>{msg}</span> : null}
        </div>

        <div style={{ overflowX: "auto", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-sunk)", textAlign: "left" }}>
                <th style={{ padding: 10 }}>Application</th>
                {evs.map((e) => <th key={e.id} style={{ padding: 10, textAlign: "center", whiteSpace: "nowrap" }}>{e.name}{e.role === "lead" ? <div style={{ fontSize: 10, color: "var(--text-faint)" }}>lead</div> : null}</th>)}
              </tr>
            </thead>
            <tbody>
              {apps.length === 0 ? <tr><td style={{ padding: 16, color: "var(--text-faint)" }} colSpan={evs.length + 1}>No applications yet — import them first.</td></tr> : null}
              {apps.map((app) => (
                <tr key={app.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: 10 }}>
                    <div style={{ fontWeight: 600 }}>{app.ref_code}</div>
                    <div style={{ color: "var(--text-muted)", maxWidth: 320 }}>{app.session_title ?? "—"}</div>
                  </td>
                  {evs.map((ev) => {
                    const a = find(app.id, ev.id);
                    const locked = a?.state === "submitted" || a?.state === "recused";
                    return (
                      <td key={ev.id} style={{ padding: 10, textAlign: "center" }}>
                        <label style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: locked || busy ? "not-allowed" : "pointer" }}>
                          <input type="checkbox" checked={!!a} disabled={locked || busy} onChange={() => toggle(app, ev)} style={{ width: 20, height: 20, accentColor: "var(--accent)" }} />
                          <span style={{ fontSize: 11, color: a?.state === "submitted" ? "var(--score-2)" : "var(--text-faint)" }}>{a ? STATE_LABEL[a.state] ?? a.state : ""}</span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
