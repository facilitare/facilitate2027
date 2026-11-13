/**
 * lib/decision-labels.ts — how stored panel decisions map to the three applicant outcomes
 * agreed for the wrangling process: Yes / Maybe / No. Display only; the stored values are unchanged.
 */
export type Outcome = "yes" | "maybe" | "no";

const OUTCOME_BY_DECISION: Record<string, Outcome> = {
  accept: "yes",
  defer: "maybe", // "we will compare it with the January submissions and let you know"
  decline: "no",
};

/** Applicant outcome for a stored decision; null for standby/reserve (not part of the Yes/Maybe/No emails). */
export function outcomeFor(decision: string | null | undefined): Outcome | null {
  return (decision && OUTCOME_BY_DECISION[decision]) || null;
}

export const OUTCOME_LABEL: Record<Outcome, string> = { yes: "Yes", maybe: "Maybe", no: "No" };

/** e.g. "Accept → Yes", "Defer → Maybe", "Standby". */
export function decisionLabel(decision: string): string {
  const base = decision.charAt(0).toUpperCase() + decision.slice(1);
  const o = outcomeFor(decision);
  return o ? `${base} → ${OUTCOME_LABEL[o]}` : base;
}
