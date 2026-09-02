"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type AuditEntry = {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: unknown;
  ip: string | null;
  at: string;
};

const ENTITIES = ["", "application", "assessment", "wave", "settings", "export", "evaluator", "assignment"];

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [entity, setEntity] = useState("");
  const [entityId, setEntityId] = useState("");
  const [limit, setLimit] = useState("50");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (entity.trim()) params.set("entity", entity.trim());
      if (entityId.trim()) params.set("entityId", entityId.trim());
      if (limit.trim()) params.set("limit", limit.trim());
      const res = await fetch(`/api/audit?${params.toString()}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Failed (${res.status})`);
        setEntries([]);
        return;
      }
      setEntries(j.entries ?? []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [entity, entityId, limit]);

  useEffect(() => {
    fetchAudit();
  }, []);

  function fmtAt(at: string) {
    try {
      const d = new Date(at);
      return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
    } catch {
      return at;
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ marginBottom: 16 }}>
        <a href="/applications" style={{ fontSize: 13, color: "var(--accent, #6c5ce7)", textDecoration: "underline" }}>
          ← Back to applications
        </a>
      </div>
      <h1 style={{ fontFamily: "var(--font-serif, serif)", fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
        Audit log
      </h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
        Reverse-chronological. Filter by entity and entity ID. Lead only. Every mutation in the system writes an audit row.
      </p>

      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.06 + "em", textTransform: "uppercase", color: "var(--muted)" }}>
              Entity
            </span>
            <select
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
              style={{
                border: "1px solid var(--border, #ddd)",
                borderRadius: 8,
                padding: "8px 10px",
                minWidth: 160,
                background: "var(--surface, #fff)",
              }}
            >
              <option value="">All</option>
              {ENTITIES.filter(Boolean).map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 180 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.06 + "em", textTransform: "uppercase", color: "var(--muted)" }}>
              Entity ID
            </span>
            <input
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="UUID or wave id"
              style={{
                border: "1px solid var(--border, #ddd)",
                borderRadius: 8,
                padding: "8px 10px",
                background: "var(--surface, #fff)",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4, width: 100 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.06 + "em", textTransform: "uppercase", color: "var(--muted)" }}>
              Limit
            </span>
            <select
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              style={{
                border: "1px solid var(--border, #ddd)",
                borderRadius: 8,
                padding: "8px 10px",
                background: "var(--surface, #fff)",
              }}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </label>

          <Button
            onClick={fetchAudit}
            disabled={loading}
            style={{ height: 36 }}
          >
            {loading ? "Loading…" : "Apply"}
          </Button>
        </div>
        {error && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              borderRadius: 8,
              background: "#fee2e2",
              color: "#7f1d1d",
              fontSize: 13,
              border: "1px solid #fecaca",
            }}
          >
            {error}
          </div>
        )}
      </Card>

      {loading && entries.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>Loading…</div>
      ) : entries.length === 0 ? (
        <Card style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>No entries</div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            No audit entries match the current filters. Try clearing the entity filter or increasing the limit.
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
            Showing {entries.length} entries · reverse-chronological (newest first)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid var(--border, #e5e7eb)", color: "var(--muted)" }}>
                  <th style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>Time</th>
                  <th style={{ padding: "8px 10px" }}>Actor</th>
                  <th style={{ padding: "8px 10px" }}>Action</th>
                  <th style={{ padding: "8px 10px" }}>Entity</th>
                  <th style={{ padding: "8px 10px" }}>Entity ID</th>
                  <th style={{ padding: "8px 10px" }}>Payload</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    style={{ borderBottom: "1px solid var(--border, #eee)", verticalAlign: "top" }}
                  >
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontSize: 12, color: "var(--muted)" }}>{fmtAt(e.at)}</td>
                    <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>{e.actor_name ?? e.actor_id ?? "system"}</td>
                    <td style={{ padding: "8px 10px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          fontFamily: "monospace",
                          fontSize: 12,
                          background: "var(--surface, #f3f4f6)",
                          border: "1px solid var(--border, #e5e7eb)",
                          borderRadius: 6,
                          padding: "2px 6px",
                        }}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 12 }}>{e.entity}</td>
                    <td
                      style={{
                        padding: "8px 10px",
                        fontFamily: "monospace",
                        fontSize: 11,
                        maxWidth: 140,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={e.entity_id ?? ""}
                    >
                      {e.entity_id ? e.entity_id.slice(0, 8) + "…" : "—"}
                    </td>
                    <td style={{ padding: "8px 10px", maxWidth: 360 }}>
                      <details>
                        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--accent, #6c5ce7)" }}>payload</summary>
                        <pre
                          style={{
                            marginTop: 6,
                            fontSize: 11,
                            background: "var(--surface, #f9fafb)",
                            border: "1px solid var(--border, #e5e7eb)",
                            borderRadius: 6,
                            padding: 8,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            maxHeight: 240,
                            overflow: "auto",
                          }}
                        >
                          {(() => {
                            try {
                              if (e.payload == null) return "—";
                              if (typeof e.payload === "string") return JSON.stringify(JSON.parse(e.payload), null, 2);
                              return JSON.stringify(e.payload, null, 2);
                            } catch {
                              return String(e.payload);
                            }
                          })()}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
