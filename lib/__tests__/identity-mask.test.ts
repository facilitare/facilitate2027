import { describe, it, expect } from "vitest";
import { makeMasker } from "../identity-mask";

describe("identity mask", () => {
  const m = makeMasker({ q20_full_name: "Alice Blackwell", q23_cofacilitators: "Lorenza Bacino", q1_email: "alice@aliceblackwell.com" });
  it("hides full name, first name, co-facilitator and website", () => {
    expect(m("Join Alice Blackwell (Facilitator) with Lorenza. See aliceblackwell.com")).toBe("Join [name] (Facilitator) with [name]. See [website]");
    expect(m("Alice will then pull back the curtain")).toBe("[name] will then pull back the curtain");
  });
  it("leaves ordinary words and other text alone", () => {
    const g = makeMasker({ q20_full_name: "Grace Will", q23_cofacilitators: "I will approach someone if I get selected" });
    expect(g("We will show grace under pressure")).toBe("We will show grace under pressure");
    expect(g("Grace runs it")).toBe("[name] runs it");
  });
  it("handles missing identity and null text", () => {
    expect(makeMasker({})("Plain text")).toBe("Plain text");
    expect(m(null)).toBeNull();
  });
});
