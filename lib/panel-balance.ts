/**
 * lib/panel-balance.ts — pure balance computations per 04-SPEC §3.8 & 05-DESIGN §7
 * No DB, no React. Shared by GET /api/panel/balance and client-side recompute.
 */

export type BalanceApp = {
  id: string;
  ref_code: string;
  status: string;
  q24_region: string | null;
  q27_under_35: boolean | null;
  q11_theme: string | null;
  q8_group_setup: string[] | null;
  q10_delivery_mode: string | null;
  q26_career_stage: string | null;
  q25_ethnicity: string | null;
};

export type BalanceSettings = {
  targetOutsidePct: number; // 50
  targetYouthPct: number; // 10
  youthThreshold: number; // 35
  smallRoomSlots: number; // 4
  ethnicityOptions: string | null; // "uk_census" or null
};

export const DEFAULT_BALANCE_SETTINGS: BalanceSettings = {
  targetOutsidePct: 50,
  targetYouthPct: 10,
  youthThreshold: 35,
  smallRoomSlots: 4,
  ethnicityOptions: "uk_census",
};

export type ThemeKey = "craft" | "clarity" | "change" | "challenge";
export const THEMES: ThemeKey[] = ["craft", "clarity", "change", "challenge"];

function isOutsideEnglandWales(region: string | null): boolean {
  if (!region) return true; // null/empty counts as outside (unknown -> not england_wales)
  return region.toLowerCase().trim() !== "england_wales";
}

function isUnder35(v: boolean | null): boolean {
  return v === true;
}

function needsUnder30(groupSetup: string[] | null): boolean {
  if (!groupSetup || groupSetup.length === 0) return false;
  for (const g of groupSetup) {
    if (!g) continue;
    if (g.toLowerCase().includes("under 30")) return true;
  }
  return false;
}

function normalizeStage(s: string | null): string {
  if (!s || s.trim() === "") return "Unknown";
  return s.trim();
}
function normalizeEthnicity(s: string | null): string {
  if (!s || s.trim() === "") return "Unknown";
  return s.trim();
}

export type OutsideBalance = {
  current: number;
  total: number;
  pct: number;
  targetPct: number;
  pass: boolean;
};

export type YouthBalance = {
  current: number;
  total: number;
  pct: number;
  targetPct: number;
  threshold: number;
  pass: boolean;
};

export type ThemeBalance = {
  total: number;
  floorPct: number;
  byTheme: Array<{ theme: ThemeKey; count: number; pct: number }>;
  minPct: number;
  pass: boolean;
};

export type GroupSizeBalance = {
  smallCount: number;
  slots: number;
  pass: boolean;
  over: boolean;
};

export type DeliveryBalance = {
  total: number;
  solo: number;
  coFac: number;
  soloPct: number;
  coFacPct: number;
};

export type CareerStageBalance = {
  total: number;
  byStage: Array<{ stage: string; count: number; pct: number }>;
};

export type EthnicityBalance =
  | { configured: false; message: string }
  | { configured: true; total: number; byEthnicity: Array<{ ethnicity: string; count: number; pct: number }> };

export type BalanceResult = {
  total: number;
  outside: OutsideBalance;
  youth: YouthBalance;
  themes: ThemeBalance;
  groupSize: GroupSizeBalance;
  delivery: DeliveryBalance;
  careerStage: CareerStageBalance;
  ethnicity: EthnicityBalance;
};

export function computeBalance(selected: BalanceApp[], settings: BalanceSettings): BalanceResult {
  const total = selected.length;

  // Outside England & Wales
  let outsideCount = 0;
  for (const a of selected) if (isOutsideEnglandWales(a.q24_region)) outsideCount++;
  const outsidePct = total > 0 ? (outsideCount / total) * 100 : 0;
  const outside: OutsideBalance = {
    current: outsideCount,
    total,
    pct: outsidePct,
    targetPct: settings.targetOutsidePct,
    pass: total === 0 ? false : outsidePct >= settings.targetOutsidePct,
  };

  // Youth
  let youthCount = 0;
  for (const a of selected) if (isUnder35(a.q27_under_35)) youthCount++;
  const youthPct = total > 0 ? (youthCount / total) * 100 : 0;
  const youth: YouthBalance = {
    current: youthCount,
    total,
    pct: youthPct,
    targetPct: settings.targetYouthPct,
    threshold: settings.youthThreshold,
    pass: total === 0 ? false : youthPct >= settings.targetYouthPct,
  };

  // Themes
  const themeCounts = new Map<ThemeKey, number>();
  for (const t of THEMES) themeCounts.set(t, 0);
  for (const a of selected) {
    const th = (a.q11_theme ?? "").toLowerCase().trim() as ThemeKey;
    if (themeCounts.has(th)) themeCounts.set(th, (themeCounts.get(th) ?? 0) + 1);
    // unknown theme ignored (counts remain 0)
  }
  const byTheme: ThemeBalance["byTheme"] = THEMES.map((th) => {
    const c = themeCounts.get(th) ?? 0;
    const pct = total > 0 ? (c / total) * 100 : 0;
    return { theme: th, count: c, pct };
  });
  const floorPct = 15;
  const minPct = byTheme.length ? Math.min(...byTheme.map((b) => b.pct)) : 0;
  const themes: ThemeBalance = {
    total,
    floorPct,
    byTheme,
    minPct,
    pass: total === 0 ? false : minPct >= floorPct,
  };

  // Group size (small rooms)
  let smallCount = 0;
  for (const a of selected) if (needsUnder30(a.q8_group_setup)) smallCount++;
  const groupSize: GroupSizeBalance = {
    smallCount,
    slots: settings.smallRoomSlots,
    pass: smallCount <= settings.smallRoomSlots,
    over: smallCount > settings.smallRoomSlots,
  };

  // Delivery mode
  let solo = 0;
  let coFac = 0;
  for (const a of selected) {
    const d = (a.q10_delivery_mode ?? "").toLowerCase();
    if (d === "solo") solo++;
    else if (d === "one_cofacilitator" || d === "two_or_more_cofacilitators" || d === "two_or_more") coFac++;
    // null/unknown ignored
  }
  const deliveryTotal = solo + coFac; // for pct we use selected total as denominator for consistency
  const soloPct = total > 0 ? (solo / total) * 100 : 0;
  const coFacPct = total > 0 ? (coFac / total) * 100 : 0;
  const delivery: DeliveryBalance = { total, solo, coFac, soloPct, coFacPct };

  // Career stage
  const stageMap = new Map<string, number>();
  for (const a of selected) {
    const s = normalizeStage(a.q26_career_stage);
    stageMap.set(s, (stageMap.get(s) ?? 0) + 1);
  }
  const byStage: CareerStageBalance["byStage"] = Array.from(stageMap.entries())
    .map(([stage, count]) => ({ stage, count, pct: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage));
  const careerStage: CareerStageBalance = { total, byStage };

  // Ethnicity
  let ethnicity: EthnicityBalance;
  const configured = settings.ethnicityOptions !== null && settings.ethnicityOptions !== undefined && String(settings.ethnicityOptions).trim() !== "" && String(settings.ethnicityOptions).toLowerCase() !== "null";
  if (!configured) {
    ethnicity = { configured: false, message: "Not configured" };
  } else {
    const ethMap = new Map<string, number>();
    for (const a of selected) {
      const e = normalizeEthnicity(a.q25_ethnicity);
      // Count even unknown? But if many unknowns, show.
      ethMap.set(e, (ethMap.get(e) ?? 0) + 1);
    }
    const byEthnicity = Array.from(ethMap.entries())
      .map(([ethnicity, count]) => ({ ethnicity, count, pct: total > 0 ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count || a.ethnicity.localeCompare(b.ethnicity));
    ethnicity = { configured: true, total, byEthnicity };
  }

  return { total, outside, youth, themes, groupSize, delivery, careerStage, ethnicity };
}

// Helpers for client quick checks
export function isSmallRoomApp(app: BalanceApp): boolean {
  return needsUnder30(app.q8_group_setup);
}
