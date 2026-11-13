"use client";
import { useEffect, useState } from "react";

type Row = {
  id: string; name: string;
  assigned: number; draft: number; submitted: number; recused: number;
  status: "done" | "nearly" | "in_progress" | "not_started" | "no_work";
  spare: number; overMax: boolean;
};
type Data = {
  assessors: Row[];
  summary: { assessors: number; done: number; nearly: number; inProgress: number; notStarted: number; noWork: number; submitted: number; allocated: number; recused: number; applications: number; required: number };
  target: number; max: number;
};

const LABEL: Record<Row["status"], string> = { done: "Finished", nearly: "Nearly finished", in_progress: "In progress", not_started: "Not started", no_work: "No assignments" };
const COLOR: Record<Row["status"], string> = { done: "var(--score-2)", nearly: "var(--score-2)", in_progress: "var(--text-muted)", not_started: "var(--danger)", no_work: "var(--text-faint)" };
const ORDER: Record<Row["status"], number> = { not_started: 0, in_progress: 1, nearly: 2, done: 3, no_work: 4 };

const th: React.CSSProperties = { padding: "8px 10px", fontSize: 11, fontWeight: 600, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", textAlign: "right" };

export default function ProgressPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/evaluators/progress", { cache: "no-store" })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `Failed ${r.status}`); setData(j); })
      .catch((e) => setErr(e.message));
  }, []);

  if (err) return <div style={{ marginTop: 20, fontSize: 12, color: "var(--danger)" }}>Assessor progress unavailable: {err}</div>;
  if (!data) return null;
  const s = data.summary;
  const rows = [...data.assessors].sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));

  return (
    <section style={{ marginTop: 20, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Assessor progress</div>
        <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
          <strong>{s.submitted}/{s.required}</strong> assessments submitted ({s.applications} applications × 4) · {s.allocated - s.submitted} allocated still to do · {s.recused} recusal{s.recused === 1 ? "" : "s"} to reallocate
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-muted)" }}>
          {s.assessors} assessors: {s.done} finished · {s.nearly} nearly · {s.inProgress} in progress · {s.notStarted} not started{s.noWork ? ` · ${s.noWork} without assignments` : ""}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--surface-sunk)" }}>
              <th style={{ ...th, textAlign: "left" }}>Assessor</th>
              <th style={th}>Submitted</th><th style={th}>Draft</th><th style={th}>Not started</th><th style={th}>Recused</th>
              <th style={th}>Room for more</th>
              <th style={{ ...th, textAlign: "left" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "8px 10px", fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{r.submitted}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{r.draft}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{r.assigned}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>{r.recused || "—"}</td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>
                  {r.overMax ? <span style={{ color: "var(--danger)", fontWeight: 600 }}>over {data.max}</span> : r.spare > 0 ? `+${r.spare}` : "—"}
                </td>
                <td style={{ padding: "8px 10px", color: COLOR[r.status], fontWeight: 600 }}>{LABEL[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding: "8px 14px", background: "var(--surface-sunk)", fontSize: 11, color: "var(--text-faint)" }}>
        “Room for more” = up to {data.target} each; the agreed maximum is {data.max}. Organising-team accounts and practice applications are excluded.
      </div>
    </section>
  );
}
