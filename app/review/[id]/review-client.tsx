"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ScoreControl } from "@/components/ui/score-control";
import { Chip } from "@/components/ui/chip";
import { ThemeBadge } from "@/components/ui/theme-badge";
import { ParticipationMeter } from "@/components/ui/participation-meter";
import type { ScoreValue } from "@/lib/rubric";

type Assessment = {
  id: string;
  application_id: string;
  evaluator_id: string;
  state: string;
  focus_score: ScoreValue | null;
  content_score: ScoreValue | null;
  interactivity_score: ScoreValue | null;
  credibility_score: ScoreValue | null;
  focus_no_evidence: boolean;
  content_no_evidence: boolean;
  interactivity_no_evidence: boolean;
  credibility_no_evidence: boolean;
  feedback_liked: string | null;
  feedback_improve: string | null;
  private_note: string | null;
  updated_at?: string;
  submitted_at?: string | null;
};

type Application = {
  id: string;
  ref_code: string;
  wave_id: string;
  q11_theme: string | null;
  q4_session_provides: string[] | null;
  q4_session_provides_other: string | null;
  q5_audience: string[] | null;
  q5_audience_other: string | null;
  q6_audience_detail: string | null;
  q7_about_session: string | null;
  q7b_benefits: string | null;
  q8_group_setup: string[] | null;
  q8_group_setup_other: string | null;
  q9_room_layout: string | null;
  q10_delivery_mode: string | null;
  q12_timekeeping: string | null;
  q13_participation_level: number | null;
  q14_methods: string[] | null;
  q14_methods_other: string | null;
  q15_first_ten_minutes: string | null;
  q16_pathway: string | null;
  q19_large_groups_english: string | null;
};

function Chips({ items, other }: { items: string[] | null; other?: string | null }) {
  const arr = items ?? [];
  if (arr.length === 0 && !other) return <span style={{ color: "var(--text-faint)", fontSize: 13 }}>—</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {arr.map((v, i) => (
        <Chip key={i}>{v}</Chip>
      ))}
      {other ? <Chip>{other}</Chip> : null}
    </div>
  );
}

function Prose({ children, large }: { children: React.ReactNode; large?: boolean }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-serif)",
        fontSize: large ? 19 : 17.5,
        lineHeight: large ? 1.7 : 1.65,
        maxWidth: "68ch",
        whiteSpace: "pre-wrap",
        color: "var(--text)",
      }}
    >
      {children ?? "—"}
    </div>
  );
}

function SectionHeading({ children, id }: { children: string; id: string }) {
  return (
    <h2
      id={id}
      style={{
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        margin: 0,
        paddingBottom: 8,
        borderBottom: "1px solid var(--border)",
        color: "var(--accent)",
      }}
    >
      {children}
    </h2>
  );
}

export default function ReviewClient({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [app, setApp] = useState<Application | null>(null);
  const [sessionMinutes, setSessionMinutes] = useState(50);
  const [iafBonusMode, setIafBonusMode] = useState<"additive" | "tiebreak">("additive");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [recuseBusy, setRecuseBusy] = useState(false);
  const [showRecuse, setShowRecuse] = useState(false);
  const [recuseReason, setRecuseReason] = useState("");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSubmitted, setShowSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Draft form state — initialized after load
  const [focusScore, setFocusScore] = useState<ScoreValue | null>(null);
  const [contentScore, setContentScore] = useState<ScoreValue | null>(null);
  const [interScore, setInterScore] = useState<ScoreValue | null>(null);
  const [credScore, setCredScore] = useState<ScoreValue | null>(null);
  const [focusNoEv, setFocusNoEv] = useState(false);
  const [contentNoEv, setContentNoEv] = useState(false);
  const [interNoEv, setInterNoEv] = useState(false);
  const [credNoEv, setCredNoEv] = useState(false);
  const [feedbackLiked, setFeedbackLiked] = useState("");
  const [feedbackImprove, setFeedbackImprove] = useState("");
  const [privateNote, setPrivateNote] = useState("");

  const didLoadRef = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}`, { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Load failed ${res.status}`);
      }
      const j = await res.json();
      const a: Assessment = j.assessment;
      const appl: Application = j.application;
      const mins = j.settings?.session_minutes ?? 50;
      const mode = (j.settings?.iaf_bonus_mode === "tiebreak" ? "tiebreak" : "additive") as "additive" | "tiebreak";
      setAssessment(a);
      setApp(appl);
      setSessionMinutes(mins);
      setIafBonusMode(mode);
      // Populate form
      setFocusScore(a.focus_score);
      setContentScore(a.content_score);
      setInterScore(a.interactivity_score);
      setCredScore(a.credibility_score);
      setFocusNoEv(!!a.focus_no_evidence);
      setContentNoEv(!!a.content_no_evidence);
      setInterNoEv(!!a.interactivity_no_evidence);
      setCredNoEv(!!a.credibility_no_evidence);
      setFeedbackLiked(a.feedback_liked ?? "");
      setFeedbackImprove(a.feedback_improve ?? "");
      setPrivateNote(a.private_note ?? "");
      if (a.state === "submitted") setShowSubmitted(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    load();
  }, [load]);

  // Mark loaded for autosave gating
  useEffect(() => {
    if (assessment && !didLoadRef.current) {
      // delay next tick so initial population doesn't trigger autosave
      setTimeout(() => {
        didLoadRef.current = true;
      }, 100);
    }
  }, [assessment]);

  // PATCH helper
  const doPatch = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!didLoadRef.current) return;
      if (assessment?.state === "submitted" || assessment?.state === "recused") return;
      setSaving(true);
      try {
        const res = await fetch(`/api/assessments/${assessmentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status === 409) {
          const j = await res.json().catch(() => ({}));
          setSubmitError(j.error ?? "Already submitted — immutable (409)");
          return;
        }
        if (!res.ok) {
          console.error("patch failed", await res.text());
          return;
        }
        const j = await res.json();
        if (j.assessment) setAssessment((prev) => (prev ? { ...prev, ...j.assessment } : prev));
        const now = new Date();
        setSavedAt(now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      } finally {
        setSaving(false);
      }
    },
    [assessmentId, assessment?.state]
  );

  // Autosave 800ms after last change
  function scheduleAutosave(payload: Record<string, unknown>) {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => doPatch(payload), 800);
  }

  // Wrap setters to trigger autosave
  function onFocusChange(v: ScoreValue | null, ne: boolean) {
    setFocusScore(v);
    setFocusNoEv(ne);
    scheduleAutosave({ focus_score: ne ? 0 : v, focus_no_evidence: ne });
  }
  function onContentChange(v: ScoreValue | null, ne: boolean) {
    setContentScore(v);
    setContentNoEv(ne);
    scheduleAutosave({ content_score: ne ? 0 : v, content_no_evidence: ne });
  }
  function onInterChange(v: ScoreValue | null, ne: boolean) {
    setInterScore(v);
    setInterNoEv(ne);
    scheduleAutosave({ interactivity_score: ne ? 0 : v, interactivity_no_evidence: ne });
  }
  function onCredChange(v: ScoreValue | null, ne: boolean) {
    setCredScore(v);
    setCredNoEv(ne);
    scheduleAutosave({ credibility_score: ne ? 0 : v, credibility_no_evidence: ne });
  }

  const total = (focusScore ?? 0) + (contentScore ?? 0) + (interScore ?? 0) + (credScore ?? 0);
  const hasAllScores = focusScore !== null && contentScore !== null && interScore !== null && credScore !== null;
  const feedbackOk = feedbackLiked.trim().length >= 20 && feedbackImprove.trim().length >= 20;
  const canSubmit = hasAllScores && feedbackOk && assessment?.state !== "submitted" && assessment?.state !== "recused";

  function submitDisabledReason(): string {
    const msgs: string[] = [];
    if (focusScore == null) msgs.push("Score Facilitation Focus");
    if (contentScore == null) msgs.push("Score Session Content");
    if (interScore == null) msgs.push("Score Interactivity");
    if (credScore == null) msgs.push("Score Credibility");
    if (feedbackLiked.trim().length < 20) msgs.push("What was strong (≥20 chars)");
    if (feedbackImprove.trim().length < 20) msgs.push("What could be improved (≥20 chars)");
    if (msgs.length === 0) return "";
    return "To submit: " + msgs.join(" · ");
  }

  async function handleSaveDraft() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    await doPatch({
      focus_score: focusNoEv ? 0 : focusScore,
      content_score: contentNoEv ? 0 : contentScore,
      interactivity_score: interNoEv ? 0 : interScore,
      credibility_score: credNoEv ? 0 : credScore,
      focus_no_evidence: focusNoEv,
      content_no_evidence: contentNoEv,
      interactivity_no_evidence: interNoEv,
      credibility_no_evidence: credNoEv,
      feedback_liked: feedbackLiked,
      feedback_improve: feedbackImprove,
      private_note: privateNote,
    });
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    // ensure latest draft saved first
    await doPatch({
      focus_score: focusNoEv ? 0 : focusScore,
      content_score: contentNoEv ? 0 : contentScore,
      interactivity_score: interNoEv ? 0 : interScore,
      credibility_score: credNoEv ? 0 : credScore,
      focus_no_evidence: focusNoEv,
      content_no_evidence: contentNoEv,
      interactivity_no_evidence: interNoEv,
      credibility_no_evidence: credNoEv,
      feedback_liked: feedbackLiked,
      feedback_improve: feedbackImprove,
      private_note: privateNote,
    });
    setSubmitBusy(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/submit`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setSubmitError(j.error ?? "Already submitted (409)");
        return;
      }
      if (!res.ok) {
        setSubmitError(j.error ?? `Submit failed ${res.status}`);
        return;
      }
      setShowSubmitted(true);
      setAssessment((prev) => (prev ? { ...prev, state: "submitted", submitted_at: new Date().toISOString() } : prev));
    } finally {
      setSubmitBusy(false);
    }
  }

  async function handleRecuse() {
    setRecuseBusy(true);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/recuse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: recuseReason || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(j.error ?? "Recuse failed");
        return;
      }
      router.push("/");
    } finally {
      setRecuseBusy(false);
    }
  }

  // Keyboard: ? opens shortcut sheet, Cmd/Ctrl+Enter submits, Tab natural
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        const active = document.activeElement?.tagName;
        if (active !== "INPUT" && active !== "TEXTAREA") {
          e.preventDefault();
          setShowShortcuts((v) => !v);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (canSubmit && !submitBusy) handleSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSubmit, submitBusy, feedbackLiked, feedbackImprove, focusScore, contentScore, interScore, credScore]);

  // Jump helpers
  function jumpTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    // also try left column container
    const left = document.getElementById("review-left");
    if (left && el) {
      const top = el.getBoundingClientRect().top + left.scrollTop - left.getBoundingClientRect().top - 16;
      left.scrollTo({ top, behavior: "smooth" });
    }
  }

  if (loading) {
    return (
      <main style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
        <div style={{ height: 24, width: 160, background: "var(--border)", borderRadius: 8, marginBottom: 16 }} />
        <div style={{ height: 16, background: "var(--surface-sunk)", borderRadius: 8 }} />
      </main>
    );
  }
  if (error) {
    return (
      <main style={{ padding: 40, maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Could not load assessment</h1>
        <p style={{ color: "var(--text-muted)" }}>{error}</p>
        <button onClick={() => load()} style={{ marginTop: 16, padding: "8px 14px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--surface)" }}>
          Retry
        </button>
      </main>
    );
  }

  // Submitted confirmation overlay
  if (showSubmitted && assessment?.state === "submitted") {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "var(--bg)" }}>
        <div style={{ maxWidth: 560, width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 32, boxShadow: "var(--shadow-md)" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Assessment submitted.</h1>
          <p style={{ color: "var(--text-muted)", marginTop: 8 }}>Your scores are final. A panel lead can reopen it if you need to change it.</p>
          <div style={{ marginTop: 20, background: "var(--surface-sunk)", borderRadius: 10, padding: 16, fontSize: 13 }}>
            <div>Facilitation Focus: <strong>{focusScore ?? "—"}</strong></div>
            <div>Session Content: <strong>{contentScore ?? "—"}</strong></div>
            <div>Interactivity: <strong>{interScore ?? "—"}</strong></div>
            <div>Credibility: <strong>{credScore ?? "—"}</strong></div>
            <div style={{ marginTop: 8, fontWeight: 600 }}>Total: {total} / {iafBonusMode === "additive" ? 10 : 8} <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 12 }}>({iafBonusMode === "additive" ? "0–10 additive · including IAF bonus" : "0–8 tiebreak · IAF not in total"})</span></div>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
            <a href={`/review/${assessmentId}/compare`} style={{ background: "var(--accent)", color: "var(--accent-text)", padding: "10px 16px", borderRadius: 8, textDecoration: "none", fontWeight: 500, fontSize: 14 }}>
              See how the panel scored this
            </a>
            <a href="/" style={{ border: "1px solid var(--border-strong)", padding: "10px 16px", borderRadius: 8, textDecoration: "none", color: "var(--text)", fontWeight: 500, fontSize: 14 }}>
              Next assessment →
            </a>
          </div>
        </div>
      </main>
    );
  }

  const leftContent = (
    <>
      {/* Skip link */}
      <a href="#scoring" style={{ position: "absolute", left: -9999, top: 0, background: "var(--accent)", color: "var(--accent-text)", padding: "8px 12px", borderRadius: 8, zIndex: 50 }} onFocus={(e) => ((e.target as HTMLElement).style.left = "12px")} onBlur={(e) => ((e.target as HTMLElement).style.left = "-9999px")}>
        Skip to scoring
      </a>

      {/* Section 1 */}
      <section id="section-focus" style={{ display: "grid", gap: 14 }}>
        <SectionHeading id="h-focus">1 — Facilitation Focus</SectionHeading>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q4 — This session provides</div>
          <div style={{ marginTop: 6 }}><Chips items={app?.q4_session_provides ?? null} other={app?.q4_session_provides_other ?? null} /></div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q5 — Audience</div>
          <div style={{ marginTop: 6 }}><Chips items={app?.q5_audience ?? null} other={app?.q5_audience_other ?? null} /></div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q6 — Who benefits</div>
          <div style={{ marginTop: 6 }}><Prose>{app?.q6_audience_detail ?? "—"}</Prose></div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q11 — Theme</div>
          <div style={{ marginTop: 6 }}>{app?.q11_theme ? <ThemeBadge theme={app.q11_theme} /> : <span style={{ color: "var(--text-faint)" }}>—</span>}</div>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "24px 0" }} />

      {/* Section 2 */}
      <section id="section-content" style={{ display: "grid", gap: 14 }}>
        <SectionHeading id="h-content">2 — Session Content</SectionHeading>
        <div style={{ background: "var(--accent-soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--text-muted)" }}>
          The session slot is {sessionMinutes} minutes, including the host&apos;s introduction and close.
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q7 — About the session</div>
          <div style={{ marginTop: 6 }}><Prose large>{app?.q7_about_session ?? "—"}</Prose></div>
        </div>
        {app?.q7b_benefits ? (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q7b — Benefits for participants</div>
            <div style={{ marginTop: 6 }}><Prose>{app.q7b_benefits}</Prose></div>
          </div>
        ) : null}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q12 — Timekeeping</div>
          <div style={{ marginTop: 6 }}><Prose>{app?.q12_timekeeping ?? "—"}</Prose></div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q8 — Group setup</div>
          <div style={{ marginTop: 6 }}><Chips items={app?.q8_group_setup ?? null} other={app?.q8_group_setup_other ?? null} /></div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q9 — Room layout</div>
          <div style={{ marginTop: 6 }}><Prose>{app?.q9_room_layout ?? "—"}</Prose></div>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "24px 0" }} />

      {/* Section 3 */}
      <section id="section-interactivity" style={{ display: "grid", gap: 14 }}>
        <SectionHeading id="h-interactivity">3 — Interactivity</SectionHeading>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q13 — Participation level</div>
          <div style={{ marginTop: 6 }}><ParticipationMeter value={app?.q13_participation_level ?? null} /></div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q14 — Methods</div>
          <div style={{ marginTop: 6 }}><Chips items={app?.q14_methods ?? null} other={app?.q14_methods_other ?? null} /></div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q15 — First ten minutes</div>
          <div style={{ marginTop: 6 }}><Prose>{app?.q15_first_ten_minutes ?? "—"}</Prose></div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q10 — Delivery mode</div>
          <div style={{ marginTop: 6 }}><span style={{ fontSize: 14, background: "var(--surface-sunk)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 10px" }}>{app?.q10_delivery_mode ?? "—"}</span></div>
        </div>
      </section>

      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "24px 0" }} />

      {/* Section 4 */}
      <section id="section-credibility" style={{ display: "grid", gap: 14 }}>
        <SectionHeading id="h-credibility">4 — Credibility and Experience</SectionHeading>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q16 — Facilitation pathway</div>
          <div style={{ marginTop: 6 }}><Prose>{app?.q16_pathway ?? "—"}</Prose></div>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q19 — Large groups and English</div>
          <div style={{ marginTop: 6 }}><Prose>{app?.q19_large_groups_english ?? "—"}</Prose></div>
        </div>
      </section>

      <div style={{ marginTop: 24, padding: "10px 12px", background: "var(--surface-sunk)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-muted)" }}>
        IAF membership is recorded separately and is not part of this assessment.
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-faint)" }}>Ref {app?.ref_code} · {app?.id.slice(0, 8)}</div>
    </>
  );

  // Scoring group helper
  function ScoringGroup({ id, children }: { id: string; children: React.ReactNode }) {
    return (
      <div id={id} style={{ display: "grid", gap: 10 }}>
        {children}
      </div>
    );
  }

  const scoredCount = [focusScore, contentScore, interScore, credScore].filter((v) => v !== null).length;
  const scoringPanel = (
    <>
      <div style={{ background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>← Read left · Score right →</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Tap 0, 1 or 2 in each card — {scoredCount}/4 scored</div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, background: scoredCount===4?"var(--accent)":"var(--surface)", color: scoredCount===4?"var(--accent-text)":"var(--text-faint)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 8px", whiteSpace: "nowrap" }}>{scoredCount}/4</div>
      </div>
      <ScoringGroup id="score-focus">
        <ScoreControl criterion="focus" value={focusScore} noEvidence={focusNoEv} onChange={onFocusChange} />
        <button onClick={() => jumpTo("section-focus")} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
          Jump to the evidence ↑
        </button>
      </ScoringGroup>

      <ScoringGroup id="score-content">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>2</span><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Score this criterion →</span></div>
        <ScoreControl criterion="content" value={contentScore} noEvidence={contentNoEv} onChange={onContentChange} />
        <button onClick={() => jumpTo("section-content")} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
          Jump to the evidence ↑
        </button>
      </ScoringGroup>

      <ScoringGroup id="score-interactivity">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>3</span><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Score this criterion →</span></div>
        <ScoreControl criterion="interactivity" value={interScore} noEvidence={interNoEv} onChange={onInterChange} />
        <button onClick={() => jumpTo("section-interactivity")} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
          Jump to the evidence ↑
        </button>
      </ScoringGroup>

      <ScoringGroup id="score-credibility">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>4</span><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Score this criterion →</span></div>
        <ScoreControl criterion="credibility" value={credScore} noEvidence={credNoEv} onChange={onCredChange} />
        <button onClick={() => jumpTo("section-credibility")} style={{ fontSize: 12, color: "var(--accent)", background: "none", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
          Jump to the evidence ↑
        </button>
      </ScoringGroup>

      <div style={{ display: "grid", gap: 12, marginTop: 4 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>What was strong about this session? <span style={{ color: "var(--danger)" }}>*</span></span>
          <textarea
            value={feedbackLiked}
            onChange={(e) => {
              setFeedbackLiked(e.target.value);
              scheduleAutosave({ feedback_liked: e.target.value });
            }}
            rows={3}
            placeholder="Be specific — this feeds the applicant feedback"
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-sans)", background: "var(--surface)", color: "var(--text)", resize: "vertical" }}
          />
          <span style={{ fontSize: 11, color: feedbackLiked.trim().length < 20 ? "var(--danger)" : "var(--text-faint)" }}>{feedbackLiked.trim().length} / 20 characters minimum</span>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>What could be improved? <span style={{ color: "var(--danger)" }}>*</span></span>
          <textarea
            value={feedbackImprove}
            onChange={(e) => {
              setFeedbackImprove(e.target.value);
              scheduleAutosave({ feedback_improve: e.target.value });
            }}
            rows={3}
            placeholder="Constructive, actionable"
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-sans)", background: "var(--surface)", color: "var(--text)", resize: "vertical" }}
          />
          <span style={{ fontSize: 11, color: feedbackImprove.trim().length < 20 ? "var(--danger)" : "var(--text-faint)" }}>{feedbackImprove.trim().length} / 20 characters minimum</span>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Private note <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>(optional, not shared with applicant)</span></span>
          <textarea
            value={privateNote}
            onChange={(e) => {
              setPrivateNote(e.target.value);
              scheduleAutosave({ private_note: e.target.value });
            }}
            rows={2}
            placeholder="For panel use only"
            style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-sans)", background: "var(--surface)", color: "var(--text)", resize: "vertical" }}
          />
        </label>
      </div>
    </>
  );

  const isSubmitted = assessment?.state === "submitted";
  const isRecused = assessment?.state === "recused";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{ height: 56, borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ fontWeight: 600, textDecoration: "none", color: "var(--text)", fontSize: 14 }}>← Queue</a>
          <span style={{ color: "var(--border-strong)" }}>|</span>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{app?.ref_code ?? "—"} · Review</span>
          {app?.q11_theme ? <ThemeBadge theme={app.q11_theme} /> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span aria-live="polite" style={{ fontSize: 12, color: "var(--text-faint)", minWidth: 90, textAlign: "right" }}>
            {saving ? "Saving…" : savedAt ? `Saved ${savedAt}` : ""}
          </span>
          <button onClick={() => setShowShortcuts((v) => !v)} title="Shortcuts (?)" style={{ fontSize: 12, border: "1px solid var(--border)", background: "var(--surface)", borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}>
            ?
          </button>
        </div>
      </header>

      {isRecused ? (
        <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 24px" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>You recused yourself from this assessment.</h1>
          <p style={{ color: "var(--text-muted)" }}>It has been removed from your queue.</p>
          <a href="/" style={{ display: "inline-block", marginTop: 16, background: "var(--accent)", color: "var(--accent-text)", padding: "10px 16px", borderRadius: 8, textDecoration: "none", fontSize: 14 }}>Back to queue</a>
        </main>
      ) : (
        <>
          {/* Desktop grid */}
          <div
            className="review-grid"
            style={
              {
                maxWidth: 1440,
                margin: "0 auto",
                padding: "24px 24px 120px",
                display: "grid",
                gridTemplateColumns: "minmax(0,1.15fr) minmax(420px,0.85fr)",
                gap: 32,
              } as React.CSSProperties
            }
          >
            <main id="review-left" aria-label="Application" style={{ minWidth: 0, maxHeight: "calc(100vh - 56px)", overflowY: "auto", paddingRight: 8, scrollbarWidth: "thin" }}>
              <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ background: "var(--surface-sunk)", borderBottom: "1px solid var(--border)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Application to evaluate</div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>{app?.ref_code ?? "—"}</span>
                      {app?.q11_theme ? <ThemeBadge theme={app.q11_theme} /> : null}
                      <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 8px" }}>Anonymous · applicant identity hidden</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-faint)", textAlign: "right" }}>
                    <div>Ref {app?.ref_code} · {app?.id.slice(0, 8)}</div>
                    <div style={{ fontSize: 11 }}>{app?.q4_session_provides?.slice(0,2).join(" · ") ?? ""}</div>
                  </div>
                </div>
                <div style={{ padding: "20px 20px 24px" }}>{leftContent}</div>
              </div>
            </main>
            <aside id="scoring" aria-label="Scoring" style={{ position: "sticky", top: 80, alignSelf: "start", maxHeight: "calc(100vh - 88px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", margin: 0 }}>Scoring</h2>
              {scoringPanel}
              {/* Spacer for footer bar overlap */}
              <div style={{ height: 40 }} />
            </aside>
          </div>

          {/* Mobile single column — hidden on desktop via CSS */}
          <div className="review-mobile" style={{ display: "none", maxWidth: 720, margin: "0 auto", padding: "16px 16px 120px", gap: 20 } as React.CSSProperties}>
            <section style={{ display: "grid", gap: 10 }}>
              <SectionHeading id="h-m-focus">1 — Facilitation Focus</SectionHeading>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q4 — This session provides</div>
                <div style={{ marginTop: 6 }}><Chips items={app?.q4_session_provides ?? null} other={app?.q4_session_provides_other ?? null} /></div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q5 — Audience</div>
                <div style={{ marginTop: 6 }}><Chips items={app?.q5_audience ?? null} other={app?.q5_audience_other ?? null} /></div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q6 — Who benefits</div>
                <div style={{ marginTop: 6 }}><Prose>{app?.q6_audience_detail ?? "—"}</Prose></div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q11 — Theme</div>
                <div style={{ marginTop: 6 }}>{app?.q11_theme ? <ThemeBadge theme={app.q11_theme} /> : null}</div>
              </div>
              <ScoreControl criterion="focus" value={focusScore} noEvidence={focusNoEv} onChange={onFocusChange} />
            </section>

            <section style={{ display: "grid", gap: 10, marginTop: 24 }}>
              <SectionHeading id="h-m-content">2 — Session Content</SectionHeading>
              <div style={{ background: "var(--accent-soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "var(--text-muted)" }}>
                The session slot is {sessionMinutes} minutes, including the host&apos;s introduction and close.
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q7 — About the session</div>
                <div style={{ marginTop: 6 }}><Prose large>{app?.q7_about_session ?? "—"}</Prose></div>
              </div>
              {app?.q7b_benefits ? (
                <div><div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q7b — Benefits</div><div style={{ marginTop: 6 }}><Prose>{app.q7b_benefits}</Prose></div></div>
              ) : null}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q12 — Timekeeping</div>
                <div style={{ marginTop: 6 }}><Prose>{app?.q12_timekeeping ?? "—"}</Prose></div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q8 — Group setup</div>
                <div style={{ marginTop: 6 }}><Chips items={app?.q8_group_setup ?? null} other={app?.q8_group_setup_other ?? null} /></div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q9 — Room layout</div>
                <div style={{ marginTop: 6 }}><Prose>{app?.q9_room_layout ?? "—"}</Prose></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>2</span><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Score this criterion →</span></div>
        <ScoreControl criterion="content" value={contentScore} noEvidence={contentNoEv} onChange={onContentChange} />
            </section>

            <section style={{ display: "grid", gap: 10, marginTop: 24 }}>
              <SectionHeading id="h-m-inter">3 — Interactivity</SectionHeading>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q13 — Participation level</div>
                <div style={{ marginTop: 6 }}><ParticipationMeter value={app?.q13_participation_level ?? null} /></div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q14 — Methods</div>
                <div style={{ marginTop: 6 }}><Chips items={app?.q14_methods ?? null} other={app?.q14_methods_other ?? null} /></div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q15 — First ten minutes</div>
                <div style={{ marginTop: 6 }}><Prose>{app?.q15_first_ten_minutes ?? "—"}</Prose></div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q10 — Delivery mode</div>
                <div style={{ marginTop: 6 }}><span style={{ fontSize: 14, background: "var(--surface-sunk)", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 10px" }}>{app?.q10_delivery_mode ?? "—"}</span></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>3</span><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Score this criterion →</span></div>
        <ScoreControl criterion="interactivity" value={interScore} noEvidence={interNoEv} onChange={onInterChange} />
            </section>

            <section style={{ display: "grid", gap: 10, marginTop: 24 }}>
              <SectionHeading id="h-m-cred">4 — Credibility and Experience</SectionHeading>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q16 — Facilitation pathway</div>
                <div style={{ marginTop: 6 }}><Prose>{app?.q16_pathway ?? "—"}</Prose></div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase", color: "var(--text-faint)" }}>Q19 — Large groups and English</div>
                <div style={{ marginTop: 6 }}><Prose>{app?.q19_large_groups_english ?? "—"}</Prose></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><span style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>4</span><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-faint)" }}>Score this criterion →</span></div>
        <ScoreControl criterion="credibility" value={credScore} noEvidence={credNoEv} onChange={onCredChange} />
            </section>

            <div style={{ marginTop: 16, padding: "10px 12px", background: "var(--surface-sunk)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--text-muted)" }}>
              IAF membership is recorded separately and is not part of this assessment.
            </div>

            <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>What was strong about this session? *</span>
                <textarea value={feedbackLiked} onChange={(e) => { setFeedbackLiked(e.target.value); scheduleAutosave({ feedback_liked: e.target.value }); }} rows={3} placeholder="Be specific" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-sans)", background: "var(--surface)", color: "var(--text)" }} />
                <span style={{ fontSize: 11, color: feedbackLiked.trim().length < 20 ? "var(--danger)" : "var(--text-faint)" }}>{feedbackLiked.trim().length} / 20</span>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>What could be improved? *</span>
                <textarea value={feedbackImprove} onChange={(e) => { setFeedbackImprove(e.target.value); scheduleAutosave({ feedback_improve: e.target.value }); }} rows={3} placeholder="Constructive" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-sans)", background: "var(--surface)", color: "var(--text)" }} />
                <span style={{ fontSize: 11, color: feedbackImprove.trim().length < 20 ? "var(--danger)" : "var(--text-faint)" }}>{feedbackImprove.trim().length} / 20</span>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Private note <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>(optional)</span></span>
                <textarea value={privateNote} onChange={(e) => { setPrivateNote(e.target.value); scheduleAutosave({ private_note: e.target.value }); }} rows={2} placeholder="For panel only" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-sans)", background: "var(--surface)", color: "var(--text)" }} />
              </label>
            </div>
          </div>
        </>
      )}

      {/* Footer bar sticky */}
      {!isRecused && !showSubmitted ? (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--surface)", borderTop: "1px solid var(--border)", boxShadow: "0 -4px 16px -4px rgb(28 25 23 / 0.10)", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", zIndex: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>Total: {hasAllScores ? total : "—"} / {iafBonusMode === "additive" ? 10 : 8} <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: 11 }} title={iafBonusMode === "additive" ? "Additive: IAF standing adds to total (max 10)" : "Tiebreak: IAF standing only breaks ties (max 8)"}>({iafBonusMode})</span></span>
            <span style={{ fontSize: 12, color: "var(--text-faint)" }} aria-live="polite">{saving ? "Saving…" : savedAt ? `Saved ${savedAt}` : ""}</span>
            {submitError ? <span style={{ fontSize: 12, color: "var(--danger)" }}>{submitError}</span> : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button onClick={handleSaveDraft} disabled={isSubmitted} style={{ padding: "8px 14px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontWeight: 500, fontSize: 13, cursor: isSubmitted ? "not-allowed" : "pointer", opacity: isSubmitted ? 0.5 : 1 }}>
              Save draft
            </button>
            <button onClick={() => setShowRecuse(true)} disabled={isSubmitted} style={{ padding: "8px 14px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--danger-soft)", color: "var(--danger)", fontWeight: 500, fontSize: 13, cursor: isSubmitted ? "not-allowed" : "pointer", opacity: isSubmitted ? 0.5 : 1 }}>
              I know this applicant — recuse me
            </button>
            <span title={canSubmit ? "" : submitDisabledReason()} style={{ display: "inline-block" }}>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitBusy || isSubmitted}
                aria-describedby="submit-hint"
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  background: canSubmit && !isSubmitted ? "var(--accent)" : "var(--border)",
                  color: canSubmit && !isSubmitted ? "var(--accent-text)" : "var(--text-faint)",
                  border: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: canSubmit && !isSubmitted ? "pointer" : "not-allowed",
                  minWidth: 160,
                }}
              >
                {submitBusy ? "Submitting…" : "Submit assessment"}
              </button>
            </span>
          </div>
        </div>
      ) : null}

      {/* Recuse modal */}
      {showRecuse ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 30, padding: 16 }}>
          <div style={{ background: "var(--surface)", borderRadius: 12, padding: 24, maxWidth: 480, width: "100%", boxShadow: "var(--shadow-md)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Recuse from this assessment?</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8 }}>This removes it from your queue. A lead can see the recusal.</p>
            <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-faint)" }}>Reason (optional)</span>
              <textarea value={recuseReason} onChange={(e) => setRecuseReason(e.target.value)} rows={2} placeholder="I recognise the applicant / conflict of interest…" style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "var(--font-sans)", background: "var(--surface)", color: "var(--text)" }} />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setShowRecuse(false)} style={{ padding: "8px 14px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>Cancel</button>
              <button onClick={handleRecuse} disabled={recuseBusy} style={{ padding: "8px 14px", borderRadius: 8, background: "var(--danger)", color: "white", border: "none", cursor: "pointer", opacity: recuseBusy ? 0.7 : 1 }}>{recuseBusy ? "Recusing…" : "Confirm recusal"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Shortcuts sheet */}
      {showShortcuts ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", display: "grid", placeItems: "center", zIndex: 30, padding: 16 }} onClick={() => setShowShortcuts(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 12, padding: 24, maxWidth: 420, width: "100%", boxShadow: "var(--shadow-md)" }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Keyboard shortcuts</h3>
            <dl style={{ marginTop: 12, display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 16px", fontSize: 13 }}>
              <dt style={{ color: "var(--text-muted)" }}><kbd>1</kbd> / <kbd>2</kbd> / <kbd>3</kbd></dt><dd>Set score for focused criterion (Below / Meets / Above)</dd>
              <dt style={{ color: "var(--text-muted)" }}>Tab</dt><dd>Move to next control</dd>
              <dt style={{ color: "var(--text-muted)" }}>⌘ + Enter</dt><dd>Submit assessment</dd>
              <dt style={{ color: "var(--text-muted)" }}>Arrow ↑ ↓</dt><dd>Move within score control</dd>
              <dt style={{ color: "var(--text-muted)" }}>?</dt><dd>Toggle this sheet</dd>
            </dl>
            <button onClick={() => setShowShortcuts(false)} style={{ marginTop: 16, padding: "8px 14px", border: "1px solid var(--border-strong)", borderRadius: 8, background: "var(--surface)", cursor: "pointer" }}>Close</button>
          </div>
        </div>
      ) : null}

      {/* responsive CSS */}
      <style>{`
        @media (max-width: 1024px) {
          .review-grid { display: none !important; }
          .review-mobile { display: grid !important; }
        }
        @media (max-width: 375px) {
          header { padding: 0 12px !important; }
        }
      `}</style>

      {!canSubmit && !isSubmitted ? <span id="submit-hint" style={{ display: "none" }}>{submitDisabledReason()}</span> : null}
    </div>
  );
}
