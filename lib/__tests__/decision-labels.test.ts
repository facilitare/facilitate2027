import { describe, it, expect } from "vitest";
import { outcomeFor, decisionLabel } from "@/lib/decision-labels";

describe("decision labels", () => {
  it("maps decisions to Yes/Maybe/No", () => {
    expect(outcomeFor("accept")).toBe("yes");
    expect(outcomeFor("defer")).toBe("maybe");
    expect(outcomeFor("decline")).toBe("no");
  });
  it("leaves standby/reserve and empty unmapped", () => {
    expect(outcomeFor("standby")).toBeNull();
    expect(outcomeFor("reserve")).toBeNull();
    expect(outcomeFor(null)).toBeNull();
  });
  it("builds labels", () => {
    expect(decisionLabel("accept")).toBe("Accept → Yes");
    expect(decisionLabel("defer")).toBe("Defer → Maybe");
    expect(decisionLabel("standby")).toBe("Standby");
  });
});
