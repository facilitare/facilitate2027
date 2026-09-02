/**
 * lib/scoring.ts — pure scoring aggregates per 04-SPEC.md §6 & 02-RUBRIC.md §5
 * No DB, no React. All functions are pure and operate over plain arrays/objects.
 */

import { QUALITY_DEFAULTS, type CriterionKey } from "./rubric";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type QualityStatus = "pass" | "below_standard" | "insufficient_data";

export type QualityThresholds = {
  minMeanTotal: number;
  minMeanPerCriterion: number;
  gateCriterion: CriterionKey;
  gateMinimum: number;
};

export type ScoringAssessment = {
  /** evaluator who produced this assessment */
  evaluatorId: string;
  /** application id (optional — needed only for grouped callers) */
  applicationId?: string;
  /** assessment state — if present, only 'submitted' rows are counted */
  state?: string;
  focus_score: number;
  content_score: number;
  interactivity_score: number;
  credibility_score: number;
};

export type ApplicationAggregates = {
  n: number;
  mean_focus: number | null;
  mean_content: number | null;
  mean_interactivity: number | null;
  mean_credibility: number | null;
  /** sum of the four criterion means (equiv. avg of per-assessment totals) */
  mean_total: number | null;
  range_focus: number | null;
  range_content: number | null;
  range_interactivity: number | null;
  range_credibility: number | null;
  /** max(range_<criterion>) */
  divergence: number | null;
  qualityStatus: QualityStatus;
  /** divergence >= 2 on any criterion */
  needsCalibration: boolean;
  /** range_focus >= 2 */
  highDivergence: boolean;
};

export type RankableApplication = {
  id: string;
  ref_code: string;
  iaf_standing: number; // 0..2
  aggregates: {
    mean_total: number | null;
    mean_interactivity: number | null;
    mean_content: number | null;
  };
};

export type IafBonusMode = "additive" | "tiebreak";

export type NormalisationOptions = {
  normalisationMinSubmissions: number;
};

const DEFAULT_THRESHOLDS: QualityThresholds = {
  minMeanTotal: QUALITY_DEFAULTS.minMeanTotal,
  minMeanPerCriterion: QUALITY_DEFAULTS.minMeanPerCriterion,
  gateCriterion: QUALITY_DEFAULTS.gateCriterion as CriterionKey,
  gateMinimum: QUALITY_DEFAULTS.gateMinimum,
};

const DEFAULT_NORMALISATION_OPTIONS: NormalisationOptions = {
  normalisationMinSubmissions: 5,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isSubmitted(a: ScoringAssessment): boolean {
  if (a.state === undefined || a.state === null) return true;
  return a.state === "submitted";
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function populationSd(values: number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return 0;
  const m = mean(values)!;
  let acc = 0;
  for (const v of values) acc += (v - m) * (v - m);
  return Math.sqrt(acc / values.length);
}

function totalOf(a: ScoringAssessment): number {
  return a.focus_score + a.content_score + a.interactivity_score + a.credibility_score;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function meanForKey(assessments: ScoringAssessment[], key: keyof Pick<ScoringAssessment, "focus_score" | "content_score" | "interactivity_score" | "credibility_score">): number | null {
  if (assessments.length === 0) return null;
  let s = 0;
  for (const a of assessments) s += a[key] as number;
  return s / assessments.length;
}

function rangeForKey(assessments: ScoringAssessment[], key: keyof Pick<ScoringAssessment, "focus_score" | "content_score" | "interactivity_score" | "credibility_score">): number | null {
  if (assessments.length === 0) return null;
  let lo = Infinity, hi = -Infinity;
  for (const a of assessments) {
    const v = a[key] as number;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return hi - lo;
}

// ---------------------------------------------------------------------------
// 6.1 Per-application aggregates
// ---------------------------------------------------------------------------
export function computeAggregates(
  assessments: ScoringAssessment[],
  thresholds: QualityThresholds = DEFAULT_THRESHOLDS
): ApplicationAggregates {
  const submitted = assessments.filter(isSubmitted);
  const n = submitted.length;

  if (n === 0) {
    return {
      n: 0,
      mean_focus: null,
      mean_content: null,
      mean_interactivity: null,
      mean_credibility: null,
      mean_total: null,
      range_focus: null,
      range_content: null,
      range_interactivity: null,
      range_credibility: null,
      divergence: null,
      qualityStatus: "insufficient_data",
      needsCalibration: false,
      highDivergence: false,
    };
  }

  const mean_focus = meanForKey(submitted, "focus_score");
  const mean_content = meanForKey(submitted, "content_score");
  const mean_interactivity = meanForKey(submitted, "interactivity_score");
  const mean_credibility = meanForKey(submitted, "credibility_score");
  const mean_total = (mean_focus ?? 0) + (mean_content ?? 0) + (mean_interactivity ?? 0) + (mean_credibility ?? 0);

  const range_focus = rangeForKey(submitted, "focus_score");
  const range_content = rangeForKey(submitted, "content_score");
  const range_interactivity = rangeForKey(submitted, "interactivity_score");
  const range_credibility = rangeForKey(submitted, "credibility_score");
  const divergence = Math.max(range_focus!, range_content!, range_interactivity!, range_credibility!);

  // 6.2 qualityStatus
  let qualityStatus: QualityStatus;
  if (n < 2) {
    qualityStatus = "insufficient_data";
  } else {
    const perCriterionFail =
      (mean_focus! < thresholds.minMeanPerCriterion) ||
      (mean_content! < thresholds.minMeanPerCriterion) ||
      (mean_interactivity! < thresholds.minMeanPerCriterion) ||
      (mean_credibility! < thresholds.minMeanPerCriterion);
    const gateMean =
      thresholds.gateCriterion === "focus" ? mean_focus!
      : thresholds.gateCriterion === "content" ? mean_content!
      : thresholds.gateCriterion === "interactivity" ? mean_interactivity!
      : mean_credibility!;
    const gateFail = gateMean < thresholds.gateMinimum;
    const totalFail = mean_total < thresholds.minMeanTotal;
    if (totalFail || perCriterionFail || gateFail) qualityStatus = "below_standard";
    else qualityStatus = "pass";
  }

  const needsCalibration = divergence >= 2;
  const highDivergence = (range_focus ?? 0) >= 2;

  return {
    n,
    mean_focus,
    mean_content,
    mean_interactivity,
    mean_credibility,
    mean_total,
    range_focus,
    range_content,
    range_interactivity,
    range_credibility,
    divergence,
    qualityStatus,
    needsCalibration,
    highDivergence,
  };
}

// ---------------------------------------------------------------------------
// 6.3 Normalisation (hawk/dove)
// ---------------------------------------------------------------------------
export type EvaluatorStats = {
  evaluatorId: string;
  mean: number;
  sd: number;
  count: number;
};

export function computeEvaluatorStats(
  allAssessments: ScoringAssessment[]
): { perEvaluator: Map<string, EvaluatorStats>; globalMean: number; globalSd: number } {
  const submitted = allAssessments.filter(isSubmitted);
  const totals = submitted.map(totalOf);
  const globalMean = totals.length ? mean(totals)! : 0;
  const globalSd = populationSd(totals);

  const byEvaluator = new Map<string, number[]>();
  for (const a of submitted) {
    const arr = byEvaluator.get(a.evaluatorId) ?? [];
    arr.push(totalOf(a));
    byEvaluator.set(a.evaluatorId, arr);
  }

  const perEvaluator = new Map<string, EvaluatorStats>();
  for (const [eid, vals] of byEvaluator) {
    perEvaluator.set(eid, {
      evaluatorId: eid,
      mean: mean(vals)!,
      sd: populationSd(vals),
      count: vals.length,
    });
  }

  return { perEvaluator, globalMean, globalSd };
}

export function adjustedTotal(
  rawTotal: number,
  evaluatorId: string,
  perEvaluator: Map<string, EvaluatorStats>,
  globalMean: number,
  globalSd: number,
  opts: NormalisationOptions = DEFAULT_NORMALISATION_OPTIONS
): number {
  const stats = perEvaluator.get(evaluatorId);
  if (!stats) return rawTotal;
  if (stats.count < opts.normalisationMinSubmissions) return rawTotal;
  // degenerate spread guard — spec says sd_e > 0.25
  if (stats.sd <= 0.25) return rawTotal;
  // guard globalSd === 0 to avoid division by zero issues (returns globalMean)
  if (globalSd === 0) return globalMean;
  return globalMean + (rawTotal - stats.mean) * (globalSd / stats.sd);
}

export function computeNormalisedTotal(
  applicationAssessments: ScoringAssessment[],
  allAssessments: ScoringAssessment[],
  opts: NormalisationOptions = DEFAULT_NORMALISATION_OPTIONS
): number | null {
  const submitted = applicationAssessments.filter(isSubmitted);
  if (submitted.length === 0) return null;

  const { perEvaluator, globalMean, globalSd } = computeEvaluatorStats(allAssessments);

  let sum = 0;
  for (const a of submitted) {
    sum += adjustedTotal(totalOf(a), a.evaluatorId, perEvaluator, globalMean, globalSd, opts);
  }
  const avg = sum / submitted.length;
  return clamp(avg, 0, 8);
}

// Convenience: normalised totals for many apps in one call
export function computeNormalisedTotals(
  applications: Map<string, ScoringAssessment[]>,
  allAssessments: ScoringAssessment[],
  opts: NormalisationOptions = DEFAULT_NORMALISATION_OPTIONS
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const [appId, arr] of applications) {
    out.set(appId, computeNormalisedTotal(arr, allAssessments, opts));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 6.4 Ranking order
// ---------------------------------------------------------------------------
export function getDisplayTotal(
  meanTotal: number | null,
  iafStanding: number,
  mode: IafBonusMode
): number | null {
  if (meanTotal === null) return null;
  if (mode === "additive") return meanTotal + iafStanding;
  return meanTotal; // tiebreak: IAF is separate sorting key
}

export function rankApplications(
  applications: RankableApplication[],
  opts: { iafBonusMode: IafBonusMode }
): RankableApplication[] {
  const mode = opts.iafBonusMode;
  const copy = [...applications];
  copy.sort((a, b) => {
    // 1. mean_total (or additive total) desc
    const aEff = getDisplayTotal(a.aggregates.mean_total, a.iaf_standing, mode);
    const bEff = getDisplayTotal(b.aggregates.mean_total, b.iaf_standing, mode);
    const aVal = aEff === null ? -1 : aEff;
    const bVal = bEff === null ? -1 : bEff;
    if (aVal !== bVal) return bVal - aVal;

    // 2. iaf_standing tiebreak (only in tiebreak mode; in additive it's already included)
    if (mode === "tiebreak" && a.iaf_standing !== b.iaf_standing) {
      return b.iaf_standing - a.iaf_standing;
    }

    // 3. mean_interactivity desc (null -> -1)
    const aInter = a.aggregates.mean_interactivity ?? -1;
    const bInter = b.aggregates.mean_interactivity ?? -1;
    if (aInter !== bInter) return bInter - aInter;

    // 4. mean_content desc
    const aContent = a.aggregates.mean_content ?? -1;
    const bContent = b.aggregates.mean_content ?? -1;
    if (aContent !== bContent) return bContent - aContent;

    // 5. ref_code asc (stable deterministic)
    if (a.ref_code < b.ref_code) return -1;
    if (a.ref_code > b.ref_code) return 1;
    return 0;
  });
  return copy;
}

// ---------------------------------------------------------------------------
// Display helpers — rounding only for display, never before summing
// ---------------------------------------------------------------------------
export function formatMeanForDisplay(value: number | null): string | null {
  if (value === null) return null;
  return value.toFixed(1);
}

// Re-export defaults for callers that need settings wiring
export { DEFAULT_THRESHOLDS, DEFAULT_NORMALISATION_OPTIONS };
export const __testHelpers = { mean, populationSd, totalOf, clamp };
