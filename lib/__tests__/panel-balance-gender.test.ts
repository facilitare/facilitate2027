import { describe, it, expect } from "vitest";
import { computeBalance, DEFAULT_BALANCE_SETTINGS, type BalanceApp } from "../panel-balance";

const app = (id: string, g: string | null): BalanceApp => ({
  id, ref_code: id, status: "accepted", q24_region: null, q27_under_35: null, q11_theme: null,
  q8_group_setup: null, q10_delivery_mode: null, q26_career_stage: null, q25_ethnicity: null, q28_gender: g,
});

describe("panel balance: gender", () => {
  it("counts selected applications by gender, blanks as Unknown, largest first", () => {
    const b = computeBalance([app("a", "Female"), app("b", "Female "), app("c", "Male"), app("d", null), app("e", "")], DEFAULT_BALANCE_SETTINGS);
    expect(b.gender.byGender).toEqual([
      { gender: "Female", count: 2, pct: 40 },
      { gender: "Unknown", count: 2, pct: 40 },
      { gender: "Male", count: 1, pct: 20 },
    ]);
  });
});
