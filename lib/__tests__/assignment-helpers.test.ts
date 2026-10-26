import { describe, it, expect } from "vitest";
import { isSelfConflict, pairingHash, MAX_APPLICATIONS_PER_ASSESSOR } from "../assignment";

describe("assignment helpers", () => {
  it("flags an evaluator named as applicant or co-facilitator, ignoring case and diacritics", () => {
    expect(isSelfConflict("Kata Faix", ["Anna Kovacs", "kata faix, Ion Popa"])).toBe(true);
    expect(isSelfConflict("Chizu Matsushita", ["Chizu Matsushita"])).toBe(true);
    expect(isSelfConflict("Gerardo De Luzenberger", ["Gerardo de Luzenberger"])).toBe(true);
    expect(isSelfConflict("Jane Clift", ["Jane Clifton"])).toBe(false);
    expect(isSelfConflict("Jane Clift", [null, undefined])).toBe(false);
  });
  it("pairingHash is stable and varies with the application", () => {
    expect(pairingHash("w", "W1-001", "e1")).toBe(pairingHash("w", "W1-001", "e1"));
    expect(pairingHash("w", "W1-001", "e1")).not.toBe(pairingHash("w", "W1-002", "e1"));
  });
  it("caps each assessor at 12", () => {
    expect(MAX_APPLICATIONS_PER_ASSESSOR).toBe(12);
  });
});
