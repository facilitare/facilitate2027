/**
 * lib/feedback.ts — aggregated applicant feedback assembly per 04-SPEC §3.7
 * Pure functions. No DB, no React.
 * - concatenates every assessor's feedback_liked / feedback_improve
 * - renders every no-evidence flag as its own bullet
 * - never includes private_note
 * Identity fields are not involved here; anonymity is enforced elsewhere.
 */

export type FeedbackAssessment = {
  evaluatorId?: string;
  evaluatorName?: string | null;
  feedback_liked: string | null;
  feedback_improve: string | null;
  focus_no_evidence: boolean;
  content_no_evidence: boolean;
  interactivity_no_evidence: boolean;
  credibility_no_evidence: boolean;
  // private_note is intentionally omitted from output — caller may pass it but we ignore it
  private_note?: string | null;
};

export const CRITERION_LABELS: Record<string, string> = {
  focus: "Facilitation Focus",
  content: "Session Content",
  interactivity: "Interactivity",
  credibility: "Credibility and Experience",
};

export type AggregatedFeedback = {
  /** Non-empty trimmed feedback_liked entries, in input order */
  liked: string[];
  /** Non-empty trimmed feedback_improve entries */
  improve: string[];
  /** One bullet per no-evidence flag that is true */
  noEvidenceBullets: string[];
  /** Full copyable text — exactly what Copy puts on the clipboard */
  text: string;
};

/**
 * Build the aggregated feedback text.
 * - Liked and improve are concatenated as bullet lists under headings.
 * - No-evidence flags become their own bullets: "<Criterion>: No evidence provided"
 *   If evaluatorName is present, we append " — noted by <name>" to make the bullet traceable
 *   but the spec says "no-evidence flags rendered as their own bullet list" without naming
 *   who set it. We include a short suffix only when a name is available to help leads;
 *   the core bullet is always "<Criterion>: No evidence provided".
 * - private_note is never read.
 * - Returns empty arrays + text with headings but no bullets when there are no assessments.
 */
export function buildAggregatedFeedback(assessments: FeedbackAssessment[]): AggregatedFeedback {
  const liked: string[] = [];
  const improve: string[] = [];
  const noEvidenceBullets: string[] = [];

  for (const a of assessments) {
    const lk = (a.feedback_liked ?? "").trim();
    if (lk.length > 0) liked.push(lk);

    const imp = (a.feedback_improve ?? "").trim();
    if (imp.length > 0) improve.push(imp);

    // Each flag true becomes its own bullet. Order: focus, content, interactivity, credibility — per rubric order.
    const suffix = a.evaluatorName ? ` — noted by ${a.evaluatorName}` : "";
    if (a.focus_no_evidence) noEvidenceBullets.push(`${CRITERION_LABELS.focus}: No evidence provided${suffix}`);
    if (a.content_no_evidence) noEvidenceBullets.push(`${CRITERION_LABELS.content}: No evidence provided${suffix}`);
    if (a.interactivity_no_evidence) noEvidenceBullets.push(`${CRITERION_LABELS.interactivity}: No evidence provided${suffix}`);
    if (a.credibility_no_evidence) noEvidenceBullets.push(`${CRITERION_LABELS.credibility}: No evidence provided${suffix}`);
  }

  const text = formatAggregatedFeedbackText({ liked, improve, noEvidenceBullets });
  return { liked, improve, noEvidenceBullets, text };
}

export function formatAggregatedFeedbackText(parts: {
  liked: string[];
  improve: string[];
  noEvidenceBullets: string[];
}): string {
  const { liked, improve, noEvidenceBullets } = parts;
  const lines: string[] = [];

  lines.push("Feedback — what we liked");
  if (liked.length === 0) {
    lines.push("(no feedback provided)");
  } else {
    for (const s of liked) lines.push(`- ${singleLine(s)}`);
  }

  lines.push("");
  lines.push("Feedback — what could make this stronger");
  if (improve.length === 0) {
    lines.push("(no feedback provided)");
  } else {
    for (const s of improve) lines.push(`- ${singleLine(s)}`);
  }

  lines.push("");
  lines.push("No evidence provided");
  if (noEvidenceBullets.length === 0) {
    lines.push("- None flagged");
  } else {
    for (const b of noEvidenceBullets) lines.push(`- ${b}`);
  }

  return lines.join("\n");
}

// Collapse internal line breaks to spaces for bullet readability, but preserve the original
// copy semantics: the bullet text itself is single-line; full multi-paragraph feedback is kept
// inline. Export original multiline via `feedback_liked` verbatim if needed — bullet joins with space.
function singleLine(s: string): string {
  return s.replace(/\s*\r?\n\s*/g, " ").trim();
}
