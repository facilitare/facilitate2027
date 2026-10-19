import { describe, it, expect } from "vitest";
import { deriveIafStandingFromForm } from "../iaf-standing";

describe("deriveIafStandingFromForm", () => {
  it("accredited members get 2 (incl. misspelt form values)", () => {
    expect(deriveIafStandingFromForm("yes", "Certified Proffesional Facilitator")).toBe(2);
    expect(deriveIafStandingFromForm("yes", "IAF CPF | Certified Profesional Facilitator")).toBe(2);
    expect(deriveIafStandingFromForm("yes", "Endorsed Facilitator")).toBe(2);
  });
  it("non-IAF / none options give 1 for members", () => {
    expect(deriveIafStandingFromForm("yes", "Non-IAF accreditation")).toBe(1);
    expect(deriveIafStandingFromForm("yes", "I have a non IAF accreditation (certified by another body)")).toBe(1);
    expect(deriveIafStandingFromForm("yes", "none of these but have other qualifications")).toBe(1);
    expect(deriveIafStandingFromForm("yes", null)).toBe(1);
  });
  it("non-members get 0, unanswered gets null", () => {
    expect(deriveIafStandingFromForm("no", "Certified Professional Facilitator")).toBe(0);
    expect(deriveIafStandingFromForm(null, null)).toBeNull();
  });
});
