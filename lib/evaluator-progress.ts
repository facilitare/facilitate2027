/**
 * lib/evaluator-progress.ts — per-evaluator assessment progress for the admin status view.
 * Pure functions: counts in, derived status out.
 */

/** Target load per assessor (Alice's plan) and the agreed hard maximum. */
export const TARGET_PER_ASSESSOR = 10;
export const MAX_PER_ASSESSOR = 15;

export type ProgressCounts = {
  assigned: number; // state 'assigned' — not opened / not started
  draft: number;
  submitted: number;
  recused: number;
};

export type ProgressStatus = "done" | "nearly" | "in_progress" | "not_started" | "no_work";

/** Active workload = everything except recused. */
export function activeLoad(c: ProgressCounts): number {
  return c.assigned + c.draft + c.submitted;
}

export function progressStatus(c: ProgressCounts): ProgressStatus {
  const load = activeLoad(c);
  if (load === 0) return "no_work";
  if (c.submitted === load) return "done";
  if (c.submitted === 0 && c.draft === 0) return "not_started";
  if (c.submitted / load >= 0.7) return "nearly";
  return "in_progress";
}

/** How many more applications this assessor can take to reach the target (never negative). */
export function spareCapacity(c: ProgressCounts, target = TARGET_PER_ASSESSOR): number {
  return Math.max(0, target - activeLoad(c));
}

export function overMax(c: ProgressCounts, max = MAX_PER_ASSESSOR): boolean {
  return activeLoad(c) > max;
}

export type ProgressSummary = {
  assessors: number;
  done: number;
  nearly: number;
  inProgress: number;
  notStarted: number;
  noWork: number;
  submitted: number;
  /** submitted + draft + assigned across all assessors (recusals excluded) */
  allocated: number;
  recused: number;
};

export function summarise(rows: ProgressCounts[]): ProgressSummary {
  const s: ProgressSummary = {
    assessors: rows.length, done: 0, nearly: 0, inProgress: 0, notStarted: 0, noWork: 0,
    submitted: 0, allocated: 0, recused: 0,
  };
  for (const r of rows) {
    const st = progressStatus(r);
    if (st === "done") s.done++;
    else if (st === "nearly") s.nearly++;
    else if (st === "in_progress") s.inProgress++;
    else if (st === "not_started") s.notStarted++;
    else s.noWork++;
    s.submitted += r.submitted;
    s.allocated += activeLoad(r);
    s.recused += r.recused;
  }
  return s;
}
