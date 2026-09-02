"use client";
import { useEffect, useState, useCallback } from "react";

type Evaluator = {
  id: string;
  name: string;
  email: string | null;
  role: "assessor" | "lead";
  active: boolean;
  created_at?: string;
};

export default function EvaluatorsClient() {
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"assessor" | "lead">("assessor");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<"assessor" | "lead">("assessor");
  const [editActive, setEditActive] = useState(true);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/evaluators?includeInactive=true", { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Failed ${res.status}`);
      setEvaluators(Array.isArray(j) ? j : j.evaluators ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) { setAddError("Name required"); return; }
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/evaluators", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() || null, role: newRole }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Failed ${res.status}`);
      setMsg(`Added ${j.name} — audited`);
      setNewName(""); setNewEmail(""); setNewRole("assessor");
      load();
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  }

  function startEdit(ev: Evaluator) {
    setEditId(ev.id);
    setEditName(ev.name);
    setEditEmail(ev.email ?? "");
    setEditRole(ev.role as any);
    setEditActive(ev.active);
  }

  async function handleUpdate() {
    if (!editId) return;
    setBusyId(editId);
    try {
      const res = await fetch("/api/evaluators", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, name: editName.trim(), email: editEmail.trim() || null, role: editRole, active: editActive }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Failed ${res.status}`);
      setMsg(`Updated ${j.name} — audited${editActive === false ? " (deactivated, scores still count)" : ""}`);
      setEditId(null);
      load();
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) {
      setError(e.message);
      setTimeout(() => setError(null), 3000);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(ev: Evaluator) {
    const nextActive = !ev.active;
    // confirm deactivate
    if (!nextActive) {
      if (!confirm(`Deactivate ${ev.name}? Their submitted scores will still count, but they will not receive new assignments. This is audited. Deletion is never allowed.`)) return;
    }
    setBusyId(ev.id);
    try {
      const res = await fetch(`/api/evaluators/${ev.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? `Failed ${res.status}`);
      setMsg(`${nextActive ? "Reactivated" : "Deactivated"} ${ev.name} — audited. ${!nextActive ? "Scores still count." : ""}`);
      load();
      setTimeout(() => setMsg(null), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}><div style={{ height: 18, width: 200, background: "var(--border)", borderRadius: 8 }} /></div>;
  }

  const activeCount = evaluators.filter(e => e.active).length;
  const inactiveCount = evaluators.filter(e => !e.active).length;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px 48px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Evaluators</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>{activeCount} active · {inactiveCount} deactivated · Deactivated evaluators are never deleted; their submitted assessments still count.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/admin/settings" style={{ fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", background: "var(--surface)", textDecoration: "none", color: "var(--text)" }}>Settings →</a>
          <a href="/panel" style={{ fontSize: 13, border: "1px solid var(--border)", borderRadius: 8, padding: "7px 12px", background: "var(--surface)", textDecoration: "none", color: "var(--text)" }}>Panel →</a>
        </div>
      </div>

      {msg && <div style={{ marginTop: 14, background: "var(--score-2-soft)", border: "1px solid var(--score-2)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--score-2)" }}>{msg}</div>}
      {error && <div style={{ marginTop: 14, background: "var(--danger-soft)", border: "1px solid var(--danger)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--danger)" }}>{error} <button onClick={() => setError(null)} style={{ marginLeft: 8, fontSize: 11, border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px", background: "var(--surface)" }}>Dismiss</button></div>}

      {/* Add form */}
      <form onSubmit={handleAdd} style={{ marginTop: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, display: "grid", gap: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Add evaluator</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name *" required style={{ flex: "1 1 200px", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-sunk)", fontSize: 13 }} />
          <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Email (optional, unique)" type="email" style={{ flex: "1 1 220px", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-sunk)", fontSize: 13 }} />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as any)} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13 }}>
            <option value="assessor">assessor</option>
            <option value="lead">lead</option>
          </select>
          <button type="submit" disabled={adding} style={{ padding: "8px 16px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: adding ? 0.6 : 1 }}>
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
        {addError && <div style={{ fontSize: 12, color: "var(--danger)" }}>{addError}</div>}
        <div style={{ fontSize: 11, color: "var(--text-faint)" }}>Product owner can swap names/emails without a developer. New evaluators start as active.</div>
      </form>

      {/* Table */}
      <div style={{ marginTop: 16, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface-sunk)", textAlign: "left" }}>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Name</th>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Email</th>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Role</th>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>Status</th>
                <th style={{ padding: "10px 12px", fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {evaluators.map((ev) => {
                const isEditing = editId === ev.id;
                return (
                  <tr key={ev.id} style={{ borderBottom: "1px solid var(--border)", opacity: ev.active ? 1 : 0.62, background: !ev.active ? "color-mix(in srgb, var(--surface-sunk) 70%, transparent)" : undefined }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600 }}>
                      {isEditing ? (
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, width: "100%" }} />
                      ) : (
                        <span title={ev.id}>{ev.name} {ev.active ? "" : "· deactivated"}</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--text-muted)" }}>
                      {isEditing ? (
                        <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="—" style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, width: "100%" }} />
                      ) : (ev.email ?? <span style={{ color: "var(--text-faint)" }}>—</span>)}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {isEditing ? (
                        <select value={editRole} onChange={(e) => setEditRole(e.target.value as any)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12 }}>
                          <option value="assessor">assessor</option>
                          <option value="lead">lead</option>
                        </select>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em", background: ev.role === "lead" ? "var(--accent-soft)" : "var(--surface-sunk)", color: ev.role === "lead" ? "var(--accent)" : "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 7px" }}>{ev.role}</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {ev.active ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--score-2)", background: "var(--score-2-soft)", border: "1px solid color-mix(in srgb, var(--score-2) 22%, transparent)", borderRadius: 999, padding: "2px 7px" }}>Active</span>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", background: "var(--surface-sunk)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 7px" }}>Deactivated</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      {isEditing ? (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <button onClick={handleUpdate} disabled={busyId === ev.id} style={{ padding: "6px 10px", borderRadius: 7, background: "var(--accent)", color: "var(--accent-text)", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{busyId === ev.id ? "Saving…" : "Save"}</button>
                          <button onClick={() => setEditId(null)} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button onClick={() => startEdit(ev)} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 12, cursor: "pointer" }}>Edit</button>
                          <button onClick={() => toggleActive(ev)} disabled={busyId === ev.id} style={{ padding: "6px 10px", borderRadius: 7, border: ev.active ? "1px solid var(--danger)" : "1px solid var(--score-2)", background: ev.active ? "var(--danger-soft)" : "var(--score-2-soft)", color: ev.active ? "var(--danger)" : "var(--score-2)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            {busyId === ev.id ? "…" : ev.active ? "Deactivate" : "Reactivate"}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {evaluators.length === 0 && (
          <div style={{ padding: 28, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>No evaluators yet. Seed the database or add one above.</div>
        )}
        <div style={{ padding: "10px 14px", background: "var(--surface-sunk)", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-faint)", lineHeight: 1.5 }}>
          Deactivation keeps <code style={{ background: "var(--surface)", padding: "1px 4px", borderRadius: 4, border: "1px solid var(--border)" }}>active=false</code> — never <code>DELETE</code>. Submitted assessments still count in every aggregate and ranking. New assignments skip deactivated evaluators. Every change is audited.
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={load} style={{ fontSize: 12, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}>Refresh</button>
        <a href="/admin/import" style={{ fontSize: 12, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-sunk)", textDecoration: "none", color: "var(--text)" }}>Import →</a>
      </div>
    </div>
  );
}
