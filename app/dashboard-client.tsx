"use client";
import { useEffect, useState } from "react";
import { ThemeBadge } from "@/components/ui/theme-badge";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type QueueItem = {
  assessmentId: string;
  applicationId: string;
  ref_code: string;
  theme: string | null;
  excerpt: string;
  state: string;
  assigned_at: string;
  updated_at: string;
  isDraft: boolean;
};

type QueueResponse = {
  evaluator: { id: string; name: string; role: string; isLead: boolean };
  wave: { id: string; name: string; status: string } | null;
  counts: { total: number; assigned: number; submitted: number; todo: number; recused: number };
  queue: QueueItem[];
  nextAssessmentId: string | null;
};

function timeSince(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: "draft",
    scoring: "scoring",
    panel: "panel",
    closed: "closed",
  };
  return map[status] ?? status;
}

type TabKey = "todo" | "submitted" | "recused";

export default function DashboardClient() {
  const [data, setData] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("todo");

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/queue", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed ${res.status}`);
      }
      const j: QueueResponse = await res.json();
      setData(j);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ height: 18, width: 180, background: "var(--border)", borderRadius: 8, marginBottom: 12 }} />
        <div style={{ height: 14, width: 240, background: "var(--surface-sunk)", borderRadius: 8, marginBottom: 24 }} />
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ height: 96, background: "var(--surface-sunk)", borderRadius: 12 }} />
          <div style={{ height: 96, background: "var(--surface-sunk)", borderRadius: 12 }} />
          <div style={{ height: 96, background: "var(--surface-sunk)", borderRadius: 12 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
        <EmptyState
          title="Could not load your queue"
          description={error}
          action={
            <Button variant="ghost" onClick={() => load()}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!data) return null;

  const { wave, counts, queue, nextAssessmentId, evaluator } = data;
  const isLead = evaluator.isLead;

  const todo = queue.filter((q) => q.state === "assigned" || q.state === "draft");
  const submitted = queue.filter((q) => q.state === "submitted");
  const recused = queue.filter((q) => q.state === "recused");

  const activeList = tab === "todo" ? todo : tab === "submitted" ? submitted : recused;

  // Empty — nothing assigned
  if (counts.total === 0) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 48px" }}>
        {wave && (
          <div style={{ marginBottom: 20 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{wave.name}</h1>
            <span
              style={{
                display: "inline-block",
                marginTop: 6,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: ".04em",
                textTransform: "uppercase",
                background: "var(--surface-sunk)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                padding: "2px 8px",
                color: "var(--text-muted)",
              }}
            >
              {statusLabel(wave.status)}
            </span>
          </div>
        )}
        <EmptyState
          title="You have no assessments yet."
          description="A panel lead assigns applications once a wave opens."
        />
        {isLead && <PanelLinks />}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 48px" }}>
      {/* Header */}
      {wave && (
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{wave.name}</h1>
          <span
            style={{
              display: "inline-block",
              marginTop: 6,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              background: "var(--surface-sunk)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "2px 8px",
              color: "var(--text-muted)",
            }}
            aria-label={`Wave status ${wave.status}`}
          >
            {statusLabel(wave.status)}
          </span>
        </div>
      )}

      {/* Progress */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 16,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <ProgressRing value={counts.submitted} max={counts.assigned} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {counts.submitted} of {counts.assigned} assessments submitted
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            {counts.todo} to do · {counts.submitted} done · {counts.recused} recused
          </div>
        </div>
      </div>

      {/* Primary action */}
      <div style={{ marginTop: 16 }}>
        {nextAssessmentId ? (
          <a
            href={`/review/${nextAssessmentId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 44,
              padding: "0 22px",
              borderRadius: 8,
              background: "var(--accent)",
              color: "var(--accent-text)",
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            Start next assessment →
          </a>
        ) : (
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 16,
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 600 }}>All done — no assessments left to score.</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
              Your submitted assessments are in the Submitted tab.
            </div>
          </div>
        )}
      </div>

      {/* Lead Panel links */}
      {isLead && <PanelLinks />}

      {/* Your queue */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", margin: 0 }}>
          Your queue
        </h2>

        {/* Tabs */}
        <div
          role="tablist"
          style={{
            display: "inline-flex",
            gap: 4,
            marginTop: 12,
            background: "var(--surface-sunk)",
            borderRadius: 999,
            padding: 4,
          }}
        >
          {(
            [
              ["todo", `To do (${todo.length})`],
              ["submitted", `Submitted (${submitted.length})`],
              ["recused", `Recused (${recused.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key as TabKey)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: tab === key ? "1px solid var(--border-strong)" : "1px solid transparent",
                background: tab === key ? "var(--surface)" : "transparent",
                fontWeight: tab === key ? 600 : 500,
                fontSize: 13,
                cursor: "pointer",
                color: tab === key ? "var(--text)" : "var(--text-muted)",
                boxShadow: tab === key ? "var(--shadow-sm)" : "none",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* List */}
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {activeList.length === 0 ? (
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 20,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 14,
              }}
            >
              {tab === "todo" && "Nothing to do — all your assessments are submitted."}
              {tab === "submitted" && "No submitted assessments yet."}
              {tab === "recused" && "No recusals."}
            </div>
          ) : (
            activeList.map((item) => (
              <a
                key={item.assessmentId}
                href={`/review/${item.assessmentId}`}
                style={{
                  display: "block",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "14px 16px",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: ".02em" }}>{item.ref_code}</span>
                  {item.theme ? <ThemeBadge theme={item.theme} /> : null}
                  {item.isDraft ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: ".04em",
                        textTransform: "uppercase",
                        background: "var(--warn-soft)",
                        color: "var(--warn)",
                        border: "1px solid color-mix(in srgb, var(--warn) 22%, transparent)",
                        borderRadius: 999,
                        padding: "2px 7px",
                      }}
                    >
                      Draft
                    </span>
                  ) : null}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: "var(--text-faint)",
                      whiteSpace: "nowrap",
                    }}
                    title={new Date(item.assigned_at).toLocaleString()}
                  >
                    Assigned {timeSince(item.assigned_at)}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontFamily: "var(--font-serif)",
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "var(--text-muted)",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    wordBreak: "break-word",
                  }}
                >
                  {item.excerpt || <span style={{ color: "var(--text-faint)" }}>No description available.</span>}
                  {item.excerpt.length === 120 ? "…" : ""}
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PanelLinks() {
  return (
    <div
      style={{
        marginTop: 16,
        background: "var(--accent-soft)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>Panel</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <a
          href="/applications"
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
          Ranking table
        </a>
        <a
          href="/panel"
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
          Programme balance
        </a>
        <a
          href="/admin/import"
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
          Import
        </a>
        <a
          href="/admin/assignments"
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
          Assignments
        </a>
      </div>
    </div>
  );
}
