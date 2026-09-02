"use client";
import { useState } from "react";

type Props = {
  applicationId: string;
  anonymityFlag: boolean;
  anonymityNotes: string | null;
  fields: Array<{
    key: string;
    label: string;
    original: string | null;
    redacted: string | null;
  }>;
};

export default function RedactionPanel({ applicationId, anonymityFlag, anonymityNotes, fields }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of fields) init[f.key] = f.redacted ?? f.original ?? "";
    return init;
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(field: string) {
    setSaving(field);
    setMessage(null);
    const text = values[field];
    const res = await fetch(`/api/applications/${applicationId}/redact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage(`Saved redaction for ${field}`);
    } else {
      setMessage(data.error ?? "Failed to save redaction");
    }
    setSaving(null);
  }

  async function dismissFlag() {
    const reason = prompt("Reason for dismissing the anonymity flag (audited):", "Reviewed — no identifying content remains");
    if (reason === null) return;
    setDismissing(true);
    setMessage(null);
    const res = await fetch(`/api/applications/${applicationId}/dismiss-flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || "dismissed by lead" }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage("Flag dismissed — application can now be assigned");
      window.location.reload();
    } else {
      setMessage(data.error ?? "Failed to dismiss flag");
    }
    setDismissing(false);
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 16, background: "var(--surface)" }}>
      <h3 style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Anonymity — lead review</h3>
      {anonymityFlag ? (
        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: 12, marginBottom: 16 }}>
          <strong style={{ color: "#92400e" }}>Flagged for anonymity leak</strong>
          {anonymityNotes && <p style={{ marginTop: 8, fontSize: 13, whiteSpace: "pre-wrap" }}>{anonymityNotes}</p>}
          <button
            onClick={dismissFlag}
            disabled={dismissing}
            style={{ marginTop: 12, background: "#fff", border: "1px solid #f59e0b", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}
          >
            {dismissing ? "Dismissing…" : "Dismiss flag"}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>No anonymity flag. Redactions remain editable.</p>
      )}

      {fields.map((f) => (
        <div key={f.key} style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>
            {f.label} <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>({f.key})</span>
          </label>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Original:</div>
          <div style={{ background: "var(--bg-subtle, #f9fafb)", border: "1px solid var(--border)", borderRadius: 8, padding: 10, fontSize: 13, whiteSpace: "pre-wrap", minHeight: 32 }}>
            {f.original ?? <em style={{ color: "var(--text-faint)" }}>— empty —</em>}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0 4px" }}>Redacted (served to assessors):</div>
          <textarea
            value={values[f.key]}
            onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
            rows={3}
            style={{ width: "100%", border: "1px solid var(--border-strong)", borderRadius: 8, padding: 8, fontSize: 13, fontFamily: "inherit" }}
          />
          <button
            onClick={() => save(f.key)}
            disabled={saving === f.key}
            style={{ marginTop: 8, background: "var(--accent)", color: "var(--accent-text)", border: "none", padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, opacity: saving === f.key ? 0.6 : 1 }}
          >
            {saving === f.key ? "Saving…" : "Save redaction"}
          </button>
        </div>
      ))}

      {message && <div style={{ marginTop: 12, fontSize: 13, color: message.startsWith("Saved") || message.startsWith("Flag dismissed") ? "#065f46" : "#b91c1c" }}>{message}</div>}
    </div>
  );
}
