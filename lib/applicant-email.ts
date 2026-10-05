/**
 * lib/applicant-email.ts — personalised email draft to an applicant.
 * Pure function, template-based (no external service): applicant data never leaves the app.
 * Uses the aggregated feedback but never assessor names or private notes.
 */
import type { AggregatedFeedback } from "@/lib/feedback";

export type EmailKind = "accept" | "decline" | "below_standard" | "update";

export type ApplicantEmailInput = {
  kind: EmailKind;
  fullName: string | null;
  sessionTitle: string | null;
  feedback: Pick<AggregatedFeedback, "liked" | "improve">;
  /** Criteria labels flagged "no evidence" by at least one assessor */
  noEvidenceCriteria: string[];
};

export type ApplicantEmail = { subject: string; body: string };

/** Map the latest panel decision + quality status to an email kind. */
export function emailKindFor(latestDecision: string | null, qualityStatus: string): EmailKind {
  if (latestDecision === "accept") return "accept";
  if (latestDecision === "decline") return qualityStatus === "below_standard" ? "below_standard" : "decline";
  if (!latestDecision && qualityStatus === "below_standard") return "below_standard";
  return "update";
}

export function firstName(fullName: string | null): string | null {
  const f = (fullName ?? "").trim().split(/\s+/)[0];
  return f ? f : null;
}

export function buildApplicantEmail(input: ApplicantEmailInput): ApplicantEmail {
  const name = firstName(input.fullName);
  const title = (input.sessionTitle ?? "").trim();
  const session = title ? `your session proposal "${title}"` : "your session proposal";
  const lines: string[] = [];

  lines.push(name ? `Dear ${name},` : "Hello,");
  lines.push("");
  lines.push(`Thank you for submitting ${session} for IAF Facilitate 2027. We know how much thought goes into a proposal, and every one was read carefully by three members of our assessment panel.`);
  lines.push("");

  const subjectBase = title ? `"${title}"` : "your session proposal";
  let subject: string;
  switch (input.kind) {
    case "accept":
      subject = `Facilitate 2027 — ${subjectBase} has been accepted`;
      lines.push("We are delighted to let you know that your session has been accepted. We will be in touch shortly with next steps and scheduling details.");
      break;
    case "decline":
      subject = `Facilitate 2027 — outcome for ${subjectBase}`;
      lines.push("We received many strong proposals this year and, after much discussion, we are not able to offer your session a place in the programme. This was a difficult decision and is not a reflection of your value as a facilitator.");
      break;
    case "below_standard":
      subject = `Facilitate 2027 — outcome for ${subjectBase}`;
      lines.push("Unfortunately we are not able to offer your session a place in the programme this time. The panel felt the proposal did not yet show enough of what we need to see against our selection criteria. We would genuinely like to help you make it stronger, so we have shared the panel's feedback below.");
      break;
    default:
      subject = `Facilitate 2027 — update on ${subjectBase}`;
      lines.push("We wanted to share the panel's feedback on your proposal with you.");
  }

  const { liked, improve } = input.feedback;
  if (liked.length > 0) {
    lines.push("");
    lines.push("What the panel appreciated:");
    for (const s of liked) lines.push(`- ${oneLine(s)}`);
  }
  if (improve.length > 0) {
    lines.push("");
    lines.push(input.kind === "accept" ? "Suggestions to make the session even stronger:" : "What could make the proposal stronger:");
    for (const s of improve) lines.push(`- ${oneLine(s)}`);
  }
  const criteria = [...new Set(input.noEvidenceCriteria)];
  if (criteria.length > 0 && input.kind !== "accept") {
    lines.push("");
    lines.push(`The panel could not find enough evidence in the application for: ${criteria.join(", ")}. Addressing these explicitly would make a big difference in a future proposal.`);
  }

  lines.push("");
  if (input.kind !== "accept") {
    lines.push("We would love to see you at Facilitate 2027 and hope you will consider applying again in the future.");
    lines.push("");
  }
  lines.push("Warm regards,");
  lines.push("The Facilitate 2027 Session Selection Team");

  return { subject, body: lines.join("\n") };
}

function oneLine(s: string): string {
  return s.replace(/\s*\r?\n\s*/g, " ").trim();
}
