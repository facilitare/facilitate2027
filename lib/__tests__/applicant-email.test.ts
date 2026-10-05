import { describe, it, expect } from "vitest";
import { buildApplicantEmail, emailKindFor, firstName } from "@/lib/applicant-email";

const feedback = { liked: ["Clear purpose"], improve: ["More detail on\nthe first 10 minutes"] };

describe("applicant email", () => {
  it("picks kind from decision and quality", () => {
    expect(emailKindFor("accept", "below_standard")).toBe("accept");
    expect(emailKindFor("decline", "pass")).toBe("decline");
    expect(emailKindFor("decline", "below_standard")).toBe("below_standard");
    expect(emailKindFor(null, "below_standard")).toBe("below_standard");
    expect(emailKindFor("defer", "pass")).toBe("update");
  });

  it("personalises with first name and title, includes feedback", () => {
    const e = buildApplicantEmail({ kind: "below_standard", fullName: "Ana Maria Pop", sessionTitle: "Big Room", feedback, noEvidenceCriteria: ["Interactivity", "Interactivity"] });
    expect(firstName("Ana Maria Pop")).toBe("Ana");
    expect(e.body.startsWith("Dear Ana,")).toBe(true);
    expect(e.subject).toContain('"Big Room"');
    expect(e.body).toContain("- Clear purpose");
    expect(e.body).toContain("- More detail on the first 10 minutes");
    expect(e.body.match(/Interactivity/g)?.length).toBe(1);
  });

  it("accept email omits no-evidence paragraph and handles missing name", () => {
    const e = buildApplicantEmail({ kind: "accept", fullName: null, sessionTitle: null, feedback: { liked: [], improve: [] }, noEvidenceCriteria: ["Content"] });
    expect(e.body.startsWith("Hello,")).toBe(true);
    expect(e.body).not.toContain("Content");
    expect(e.body).toContain("accepted");
  });
});
