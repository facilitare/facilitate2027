import { describe, it, expect } from "vitest";
import {
  computeAggregates,
  computeNormalisedTotal,
  computeEvaluatorStats,
  adjustedTotal,
  rankApplications,
  getDisplayTotal,
  formatMeanForDisplay,
  __testHelpers,
  type ScoringAssessment,
} from "./scoring";
import { QUALITY_DEFAULTS } from "./rubric";

function mk(evaluatorId: string, f: number, c: number, i: number, k: number, state = "submitted"): ScoringAssessment {
  return { evaluatorId, focus_score: f, content_score: c, interactivity_score: i, credibility_score: k, state };
}

describe("6.1 per-application aggregates — submitted only", () => {
  it("n=0: all aggregates null, insufficient_data, no divergence", () => {
    const agg = computeAggregates([]);
    expect(agg.n).toBe(0);
    expect(agg.mean_focus).toBeNull();
    expect(agg.mean_content).toBeNull();
    expect(agg.mean_interactivity).toBeNull();
    expect(agg.mean_credibility).toBeNull();
    expect(agg.mean_total).toBeNull();
    expect(agg.range_focus).toBeNull();
    expect(agg.divergence).toBeNull();
    expect(agg.qualityStatus).toBe("insufficient_data");
    expect(agg.needsCalibration).toBe(false);
    expect(agg.highDivergence).toBe(false);
  });

  it("n=0 with draft/recused inputs still counts as n=0 (excluded)", () => {
    const agg = computeAggregates([
      { evaluatorId: "e1", focus_score: 2, content_score: 2, interactivity_score: 2, credibility_score: 2, state: "draft" },
      { evaluatorId: "e2", focus_score: 0, content_score: 0, interactivity_score: 0, credibility_score: 0, state: "recused" },
    ]);
    expect(agg.n).toBe(0);
    expect(agg.qualityStatus).toBe("insufficient_data");
  });

  it("n=1: means equal the single assessment, divergence 0, insufficient_data", () => {
    const agg = computeAggregates([mk("e1", 1, 2, 0, 1)]);
    expect(agg.n).toBe(1);
    expect(agg.mean_focus).toBe(1);
    expect(agg.mean_content).toBe(2);
    expect(agg.mean_interactivity).toBe(0);
    expect(agg.mean_credibility).toBe(1);
    expect(agg.mean_total).toBe(4);
    expect(agg.range_focus).toBe(0);
    expect(agg.range_content).toBe(0);
    expect(agg.divergence).toBe(0);
    expect(agg.qualityStatus).toBe("insufficient_data");
  });

  it("unanimous scores: mean equals that score, divergence 0, no calibration", () => {
    const agg = computeAggregates([
      mk("e1", 2, 1, 2, 1),
      mk("e2", 2, 1, 2, 1),
      mk("e3", 2, 1, 2, 1),
    ]);
    expect(agg.mean_focus).toBe(2);
    expect(agg.mean_content).toBe(1);
    expect(agg.mean_interactivity).toBe(2);
    expect(agg.mean_credibility).toBe(1);
    expect(agg.mean_total).toBe(6);
    expect(agg.divergence).toBe(0);
    expect(agg.needsCalibration).toBe(false);
    expect(agg.highDivergence).toBe(false);
    expect(agg.qualityStatus).toBe("pass");
  });

  it("maximum divergence: range 2 on at least one criterion", () => {
    // extremes 0 and 2 on focus => range 2 => max divergence 2
    const agg = computeAggregates([
      mk("e1", 0, 1, 1, 1),
      mk("e2", 2, 1, 1, 1),
      mk("e3", 0, 1, 1, 1),
    ]);
    expect(agg.range_focus).toBe(2);
    expect(agg.divergence).toBe(2);
    expect(agg.needsCalibration).toBe(true);
    expect(agg.highDivergence).toBe(true); // focus gate
  });

  it("draft/recused excluded even when mixed with submitted", () => {
    const agg = computeAggregates([
      mk("e1", 2, 2, 2, 2, "submitted"),
      mk("e2", 0, 0, 0, 0, "draft"),
      mk("e3", 0, 0, 0, 0, "recused"),
    ]);
    expect(agg.n).toBe(1);
    expect(agg.mean_total).toBe(8);
  });

  it("mean_total equals avg of per-assessment totals", () => {
    const as = [mk("e1", 2, 1, 0, 1), mk("e2", 0, 2, 1, 0), mk("e3", 1, 1, 1, 1)];
    const agg = computeAggregates(as);
    const totals = as.map((a) => a.focus_score + a.content_score + a.interactivity_score + a.credibility_score);
    const avgTotal = totals.reduce((s, v) => s + v, 0) / totals.length;
    expect(agg.mean_total).toBeCloseTo(avgTotal, 10);
  });
});

describe("6.2 quality standard", () => {
  it("gate rule drops a high-total application to below_standard", () => {
    // High elsewhere but focus low: focus mean < 1.0 gate
    // App: e1 (0,2,2,2) total 6, e2 (0,2,2,2) total 6, e3 (1,2,2,2) total 7 => focus mean 0.333, total mean ~6.333 >5 but gate fails
    const agg = computeAggregates([
      mk("e1", 0, 2, 2, 2),
      mk("e2", 0, 2, 2, 2),
      mk("e3", 1, 2, 2, 2),
    ]);
    expect(agg.mean_total).toBeCloseTo(6.3333333333, 5);
    expect(agg.mean_focus).toBeCloseTo(0.3333333333, 5);
    expect(agg.qualityStatus).toBe("below_standard");
  });

  it("pass when all means meet thresholds", () => {
    // default thresholds: minMeanTotal 5.0, minPerCriterion 1.0, gate 1.0 on focus
    const agg = computeAggregates([
      mk("e1", 1, 1, 1, 2),
      mk("e2", 1, 2, 1, 2),
    ]);
    // mean_focus 1, mean_content 1.5, mean_inter 1, mean_cred 2, mean_total 5.5
    expect(agg.qualityStatus).toBe("pass");
  });

  it("below_standard when mean_total < threshold", () => {
    const agg = computeAggregates([
      mk("e1", 1, 1, 1, 1),
      mk("e2", 1, 1, 1, 1),
    ]);
    // total 4 < 5
    expect(agg.mean_total).toBe(4);
    expect(agg.qualityStatus).toBe("below_standard");
  });

  it("below_standard when any criterion mean < minMeanPerCriterion", () => {
    const agg = computeAggregates([
      mk("e1", 1, 1, 0, 2),
      mk("e2", 1, 1, 0, 2),
    ]);
    expect(agg.mean_interactivity).toBe(0);
    expect(agg.qualityStatus).toBe("below_standard");
  });

  it("insufficient_data trumps below_standard when n<2 (even if failing)", () => {
    const agg = computeAggregates([mk("e1", 0, 0, 0, 0)]);
    // would otherwise be below_standard but n=1 => insufficient_data
    expect(agg.qualityStatus).toBe("insufficient_data");
  });

  it("respects custom thresholds", () => {
    const agg = computeAggregates([mk("e1", 1, 1, 1, 1), mk("e2", 1, 1, 1, 1)], {
      minMeanTotal: 3.0,
      minMeanPerCriterion: 0.5,
      gateCriterion: "focus",
      gateMinimum: 0.5,
    });
    expect(agg.qualityStatus).toBe("pass");
  });
});

describe("6.3 normalisation hawk/dove", () => {
  it("sd_e = 0 guard: evaluator with zero spread returns raw total", () => {
    // e_hawk gives all 6's => sd=0 => guarded
    // Need enough submissions to exceed min (default 5)
    const all: ScoringAssessment[] = [];
    // hawk: 5 assessments totalling 6 each
    for (let i = 0; i < 5; i++) all.push(mk("hawk", 2, 2, 1, 1)); // 6
    // dove: varied
    for (let i = 0; i < 5; i++) all.push(mk("dove", i % 2 === 0 ? 1 : 0, 1, 1, 1));
    // target app with hawk's assessment
    const appAssessments = [mk("hawk", 2, 2, 1, 1)];
    const normalised = computeNormalisedTotal(appAssessments, all);
    // hawk sd=0 so adjusted should be raw 6
    expect(normalised).toBe(6);
  });

  it("sd_e <=0.25 guard also leaves score alone", () => {
    // Create evaluator with tiny spread: 5 values of 4 with one 5 remote but sd remains <=0.25 ?
    // Use 5x 4 (1+1+1+1) and actually sd=0 -> covered. Let's make 4x4 and 1x5 => sd?
    // Totals: [4,4,4,4,5] mean 4.2 sd ~0.4 >0.25 would not guard. So need low variance case: [4,4,4,4,4,4] sd 0.
    // Instead test helper directly:
    const perEval = new Map();
    perEval.set("e1", { evaluatorId: "e1", mean: 4, sd: 0.2, count: 5 });
    const adj = adjustedTotal(6, "e1", perEval, 5, 1);
    expect(adj).toBe(6); // guarded by sd<=0.25
  });

  it("evaluator below min submissions contributes raw total (no normalisation)", () => {
    // min default 5; e_new has 2 submissions below threshold
    const all: ScoringAssessment[] = [
      mk("e_new", 2, 2, 2, 2),
      mk("e_new", 2, 2, 2, 2),
      // others to set global mean/sd
      mk("e_old", 0, 0, 0, 0),
      mk("e_old", 0, 0, 0, 0),
      mk("e_old", 0, 0, 0, 0),
      mk("e_old", 0, 0, 0, 0),
      mk("e_old", 0, 0, 0, 0),
      mk("e_old", 2, 2, 2, 2),
    ];
    // app where e_new gave 8
    const appAssessments = [mk("e_new", 2, 2, 2, 2)];
    const normalised = computeNormalisedTotal(appAssessments, all);
    expect(normalised).toBe(8); // raw
  });

  it("hawk/dove adjustment direction: hawk is pulled down, dove pulled up", () => {
    // Build scenario: hawk mean high, dove mean low.
    // hawk: totals 7,7,7,7,7,7 => mean 7 sd 0 => guarded -> raw, but we need sd>0.25 to see adjustment.
    // Let's use hawk totals 6,8,6,8,6,8 => mean 7 sd 1, dove totals 2,4,2,4,2,4 => mean 3 sd 1
    const all: ScoringAssessment[] = [];
    for (let i = 0; i < 6; i++) {
      const t = i % 2 === 0 ? 6 : 8; // 1+2+2+1=6 etc but total matters; use explicit combos
      // fabricate scores summing to t
      if (t === 6) all.push(mk("hawk", 2, 2, 1, 1));
      else all.push(mk("hawk", 2, 2, 2, 2));
    }
    for (let i = 0; i < 6; i++) {
      const t = i % 2 === 0 ? 2 : 4;
      if (t === 2) all.push(mk("dove", 1, 1, 0, 0));
      else all.push(mk("dove", 1, 1, 1, 1));
    }
    const { globalMean, globalSd } = computeEvaluatorStats(all);
    // globalMean = (hawk 42 + dove 18)/12 = 60/12=5, globalSd population: values [6,8,6,8,6,8,2,4,2,4,2,4] => compute
    expect(globalMean).toBeCloseTo(5, 5);
    // App has one hawk giving 8 and one dove giving 2 => after adjustment hawk's 8 should be below 8, dove's 2 above 2, normalised between
    const appAssessments = [mk("hawk", 2, 2, 2, 2), mk("dove", 1, 1, 0, 0)]; // totals 8 and 2
    const normalised = computeNormalisedTotal(appAssessments, all);
    // compute adjusted manually:
    // hawk stats mean 7 sd 1, dove mean 3 sd 1, global sd approx 2.16
    // adjusted hawk 8: 5 + (8-7)*(globalSd/1) = 5+globalSd
    // adjusted dove 2: 5 + (2-3)*(globalSd/1) = 5 - globalSd
    // average = 5, clamped.
    // So normalised should be 5
    expect(normalised).toBeCloseTo(5, 5);
  });

  it("normalisation clamped to [0,8]", () => {
    // Extreme hawk/dove could push outside; ensure clamped
    // Use global sd large, evaluator sd tiny but above guard (0.3) would amplify.
    // Just test clamp helper directly via constructed totals
    const all: ScoringAssessment[] = [];
    // evaluator e1: mixed totals to give sd ~0.5 mean 4
    // totals: [4,4,4,4,5,3] => mean 4 sd ~0.577
    all.push(mk("e1", 1, 1, 1, 1)); //4
    all.push(mk("e1", 1, 1, 1, 1)); //4
    all.push(mk("e1", 1, 1, 1, 1)); //4
    all.push(mk("e1", 1, 1, 1, 1)); //4
    all.push(mk("e1", 2, 1, 1, 1)); //5
    all.push(mk("e1", 0, 1, 1, 1)); //3
    // other evaluators to widen global
    for (let i = 0; i < 6; i++) all.push(mk("e2", 0, 0, 0, 0)); //0
    for (let i = 0; i < 6; i++) all.push(mk("e2", 2, 2, 2, 2)); //8
    // Now app with e1 giving 8 would be adjusted high but clamped?
    // We just ensure result is within bounds
    const n = computeNormalisedTotal([mk("e1", 2, 2, 2, 2)], all);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(8);
  });

  it("explicit sd_e=0 guard via computeEvaluatorStats", () => {
    const all = [mk("e1", 1, 1, 1, 1), mk("e1", 1, 1, 1, 1), mk("e1", 1, 1, 1, 1), mk("e1", 1, 1, 1, 1), mk("e1", 1, 1, 1, 1)];
    const { perEvaluator, globalMean, globalSd } = computeEvaluatorStats(all);
    const s = perEvaluator.get("e1")!;
    expect(s.sd).toBe(0);
    const adj = adjustedTotal(4, "e1", perEvaluator, globalMean, globalSd);
    expect(adj).toBe(4);
  });
});

describe("6.4 ranking order", () => {
  it("additive mode: iaf_standing added to total, ranking uses effective total", () => {
    const a = { id: "a", ref_code: "W1-001", iaf_standing: 2, aggregates: { mean_total: 6, mean_interactivity: 1, mean_content: 1 } };
    const b = { id: "b", ref_code: "W1-002", iaf_standing: 0, aggregates: { mean_total: 7, mean_interactivity: 1, mean_content: 1 } };
    // additive: a effective 8, b effective 7 => a wins
    const rankedAdd = rankApplications([a, b], { iafBonusMode: "additive" });
    expect(rankedAdd[0].id).toBe("a");
    expect(getDisplayTotal(rankedAdd[0].aggregates.mean_total, rankedAdd[0].iaf_standing, "additive")).toBe(8);
    expect(getDisplayTotal(rankedAdd[1].aggregates.mean_total, rankedAdd[1].iaf_standing, "additive")).toBe(7);

    // tiebreak: rank by mean_total first, iaf second
    const rankedTie = rankApplications([a, b], { iafBonusMode: "tiebreak" });
    expect(rankedTie[0].id).toBe("b"); // higher primary total wins
    expect(getDisplayTotal(rankedTie[0].aggregates.mean_total, rankedTie[0].iaf_standing, "tiebreak")).toBe(7);
    expect(getDisplayTotal(rankedTie[1].aggregates.mean_total, rankedTie[1].iaf_standing, "tiebreak")).toBe(6);
  });

  it("tiebreak uses iaf_standing as step 2", () => {
    const apps = [
      { id: "a", ref_code: "W1-003", iaf_standing: 2, aggregates: { mean_total: 6, mean_interactivity: 1, mean_content: 1 } },
      { id: "b", ref_code: "W1-001", iaf_standing: 0, aggregates: { mean_total: 6, mean_interactivity: 1, mean_content: 1 } },
      { id: "c", ref_code: "W1-002", iaf_standing: 1, aggregates: { mean_total: 6, mean_interactivity: 1, mean_content: 1 } },
    ];
    const ranked = rankApplications(apps, { iafBonusMode: "tiebreak" });
    expect(ranked.map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("next tiebreakers: interactivity then content then ref_code asc", () => {
    const apps = [
      { id: "a", ref_code: "W1-003", iaf_standing: 0, aggregates: { mean_total: 6, mean_interactivity: 1, mean_content: 2 } },
      { id: "b", ref_code: "W1-002", iaf_standing: 0, aggregates: { mean_total: 6, mean_interactivity: 2, mean_content: 0 } },
      { id: "c", ref_code: "W1-001", iaf_standing: 0, aggregates: { mean_total: 6, mean_interactivity: 2, mean_content: 1 } },
    ];
    const ranked = rankApplications(apps, { iafBonusMode: "additive" });
    // highest interactivity wins first: b and c (2) before a (1); between b and c, higher content wins: c (1) before b (0)
    expect(ranked.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("stable deterministic by ref_code", () => {
    const apps = [
      { id: "a", ref_code: "W1-002", iaf_standing: 0, aggregates: { mean_total: 5, mean_interactivity: 1, mean_content: 1 } },
      { id: "b", ref_code: "W1-001", iaf_standing: 0, aggregates: { mean_total: 5, mean_interactivity: 1, mean_content: 1 } },
    ];
    const ranked = rankApplications(apps, { iafBonusMode: "additive" });
    expect(ranked[0].ref_code).toBe("W1-001");
    expect(ranked[1].ref_code).toBe("W1-002");
  });

  it("n=0 (null totals) sort last", () => {
    const apps = [
      { id: "a", ref_code: "W1-001", iaf_standing: 0, aggregates: { mean_total: null, mean_interactivity: null, mean_content: null } },
      { id: "b", ref_code: "W1-002", iaf_standing: 0, aggregates: { mean_total: 5, mean_interactivity: 1, mean_content: 1 } },
    ];
    const ranked = rankApplications(apps, { iafBonusMode: "additive" });
    expect(ranked[0].id).toBe("b");
  });
});

describe("hand-computed worked example (arithmetic in comment)", () => {
  /**
   * Hand-computed example — verify formula without re-deriving.
   *
   * 3 assessors on one application:
   *   e1: focus 2, content 1, interactivity 0, credibility 2 => total 5
   *   e2: focus 1, content 1, interactivity 2, credibility 1 => total 5
   *   e3: focus 2, content 2, interactivity 1, credibility 1 => total 6
   *
   * Per-criterion means:
   *   focus: (2+1+2)/3 = 5/3 = 1.666666...
   *   content: (1+1+2)/3 = 4/3 = 1.333333...
   *   interactivity: (0+2+1)/3 = 3/3 = 1.0
   *   credibility: (2+1+1)/3 = 4/3 = 1.333333...
   *   mean_total = 1.6666+1.3333+1.0+1.3333 = 16/3 = 5.333333...
   *             equivalently avg of totals = (5+5+6)/3 = 16/3
   *   ranges: focus 2-1=1, content 2-1=1, inter 2-0=2, cred 2-1=1 => divergence 2 => needsCalibration true, highDivergence false (focus range 1)
   *   n=3 so qualityStatus computed against defaults (5.0,1.0, gate 1.0 on focus):
   *     mean_total 5.333 >=5 pass, each criterion >=1 pass, gate focus 1.666>=1 pass => pass
   */
  it("matches hand-computed means, totals, divergence and quality", () => {
    const assessments = [
      mk("e1", 2, 1, 0, 2),
      mk("e2", 1, 1, 2, 1),
      mk("e3", 2, 2, 1, 1),
    ];
    const agg = computeAggregates(assessments);
    expect(agg.n).toBe(3);
    expect(agg.mean_focus).toBeCloseTo(5 / 3, 10);
    expect(agg.mean_content).toBeCloseTo(4 / 3, 10);
    expect(agg.mean_interactivity).toBeCloseTo(1, 10);
    expect(agg.mean_credibility).toBeCloseTo(4 / 3, 10);
    expect(agg.mean_total).toBeCloseTo(16 / 3, 10);
    expect(agg.range_focus).toBe(1);
    expect(agg.range_interactivity).toBe(2);
    expect(agg.divergence).toBe(2);
    expect(agg.needsCalibration).toBe(true);
    expect(agg.highDivergence).toBe(false);
    expect(agg.qualityStatus).toBe("pass");
  });

  /**
   * Second hand-computed normalisation example:
   * All assessments (panel):
   *   hawk: 5x total 8 (2+2+2+2) and 1x total 6 (2+2+1+1) not needed; simplified panel below
   *   Use panel of 6 assessments: totals [6,8,6,8,6,8,2,4,2,4,2,4] as before
   *   global mean 5, global sd sqrt(((6-5)^2*3+(8-5)^2*3+(2-5)^2*3+(4-5)^2*3)/12)= sqrt((3+27+27+3)/12)=sqrt(60/12)=sqrt(5)=2.23607
   *   hawk mean 7 sd 1, dove mean 3 sd 1
   *   application has hawk 8 and dove 2:
   *     adjusted hawk = 5 + (8-7)*(2.236/1) = 7.236...
   *     adjusted dove = 5 + (2-3)*(2.236/1) = 2.763...
   *     normalised = (7.236+2.763)/2 = 5.0, clamped [0,8]
   */
  it("hand-computed normalisation matches formula", () => {
    const all: ScoringAssessment[] = [];
    for (let i = 0; i < 3; i++) all.push(mk("hawk", 2, 2, 1, 1)); //6
    for (let i = 0; i < 3; i++) all.push(mk("hawk", 2, 2, 2, 2)); //8
    for (let i = 0; i < 3; i++) all.push(mk("dove", 1, 1, 0, 0)); //2
    for (let i = 0; i < 3; i++) all.push(mk("dove", 1, 1, 1, 1)); //4
    const app = [mk("hawk", 2, 2, 2, 2), mk("dove", 1, 1, 0, 0)];
    const n = computeNormalisedTotal(app, all);
    expect(n).toBeCloseTo(5.0, 5);
  });
});

describe("no rounding before display", () => {
  it("keeps full precision until formatMeanForDisplay", () => {
    // mean 4/3 = 1.333333..., not 1.3 rounded prematurely
    const agg = computeAggregates([
      mk("e1", 1, 1, 1, 1),
      mk("e2", 1, 1, 1, 1),
      mk("e3", 2, 2, 2, 2),
    ]);
    // focus mean = (1+1+2)/3 = 1.333333...
    expect(agg.mean_focus).toBeCloseTo(1.33333333333, 10);
    expect(agg.mean_focus).not.toBe(1.3);
    // display helper rounds to one decimal
    expect(formatMeanForDisplay(agg.mean_focus)).toBe("1.3");
    expect(formatMeanForDisplay(1.666666)).toBe("1.7");
    // sum uses full precision: mean_total should be 4 * 1.333... = 5.333...
    expect(agg.mean_total).toBeCloseTo(5.33333333333, 10);
    expect(formatMeanForDisplay(agg.mean_total)).toBe("5.3");
  });

  it("mean_total is mean_focus+... without prior rounding", () => {
    // Construct where rounded components would give different total if rounded first
    // e.g., focus mean 1.333..., content 1.333..., inter 1.333..., cred 1.0 => total 5.0 exactly? Not good
    // Use 1.666... case: if we rounded each to 1.7 before summing we'd get 5.4 vs correct 5.333 -> diff
    const agg = computeAggregates([
      mk("e1", 2, 1, 0, 2),
      mk("e2", 1, 1, 2, 1),
      mk("e3", 2, 2, 1, 1),
    ]);
    const roundedSum = [agg.mean_focus!, agg.mean_content!, agg.mean_interactivity!, agg.mean_credibility!]
      .map((v) => Number(v.toFixed(1)))
      .reduce((s, v) => s + v, 0);
    // raw mean_total should NOT equal roundedSum (demonstrates no premature rounding)
    // raw is 5.333..., roundedSum is 1.7+1.3+1.0+1.3=5.3
    expect(agg.mean_total).toBeCloseTo(5.333333, 5);
    expect(roundedSum).toBeCloseTo(5.3, 5);
    expect(agg.mean_total).not.toBeCloseTo(roundedSum, 5);
  });
});

describe("edge: below normalisation_min_submissions still raw", () => {
  it("explicit opts normalisationMinSubmissions", () => {
    const all = [
      mk("e1", 2, 2, 2, 2),
      mk("e1", 2, 2, 2, 2),
      mk("e1", 0, 0, 0, 0),
      mk("e1", 0, 0, 0, 0),
      mk("e2", 1, 1, 1, 1),
      mk("e2", 1, 1, 1, 1),
      mk("e2", 1, 1, 1, 1),
      mk("e2", 1, 1, 1, 1),
      mk("e2", 1, 1, 1, 1),
    ];
    // e1 has 4 submissions (<5) => raw; e2 has 5 => normalised but sd=0 => raw anyway
    const n = computeNormalisedTotal([mk("e1", 2, 2, 2, 2)], all, { normalisationMinSubmissions: 5 });
    expect(n).toBe(8);
    // with lower threshold 3, e1 would be normalised (but sd guard still applies -> raw since sd high? actually sd for e1 is 4 => >0.25 so would adjust)
    // This test just ensures the option is respected — we assert raw for threshold 5
  });
});
