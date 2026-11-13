import { describe, it, expect } from "vitest";
import { progressStatus, spareCapacity, overMax, summarise } from "@/lib/evaluator-progress";

const c = (assigned: number, draft: number, submitted: number, recused = 0) => ({ assigned, draft, submitted, recused });

describe("evaluator progress", () => {
  it("derives status", () => {
    expect(progressStatus(c(0, 0, 0))).toBe("no_work");
    expect(progressStatus(c(0, 0, 10))).toBe("done");
    expect(progressStatus(c(10, 0, 0))).toBe("not_started");
    expect(progressStatus(c(2, 0, 8))).toBe("nearly");
    expect(progressStatus(c(5, 1, 4))).toBe("in_progress");
    expect(progressStatus(c(3, 1, 0))).toBe("in_progress"); // started a draft
    expect(progressStatus(c(0, 0, 5, 3))).toBe("done"); // recusals don't count against completion
  });

  it("spare capacity excludes recusals and never goes negative", () => {
    expect(spareCapacity(c(0, 0, 9))).toBe(1);
    expect(spareCapacity(c(0, 0, 6, 4))).toBe(4);
    expect(spareCapacity(c(0, 0, 12))).toBe(0);
  });

  it("flags overload above the agreed maximum of 15", () => {
    expect(overMax(c(0, 0, 15))).toBe(false);
    expect(overMax(c(1, 0, 15))).toBe(true);
  });

  it("summarises totals", () => {
    const s = summarise([c(0, 0, 10), c(10, 0, 0), c(2, 0, 8, 1)]);
    expect(s).toMatchObject({ assessors: 3, done: 1, notStarted: 1, nearly: 1, submitted: 18, allocated: 30, recused: 1 });
  });
});
