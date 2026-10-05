import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("import -> autoAssign wiring", () => {
  const commit = read("app/api/import/commit/route.ts");
  it("commit route calls autoAssign after processImport and returns the result", () => {
    expect(commit).toMatch(/import \{ autoAssign \} from "@\/lib\/assignment"/);
    expect(commit.indexOf("processImport({")).toBeLessThan(commit.indexOf("autoAssign({"));
    expect(commit).toMatch(/autoAssign\(\{ waveId: waveId!/);
    expect(commit).toMatch(/Response\.json\(\{ \.\.\.report, assignment \}\)/);
    expect(commit).toMatch(/shortfall: r\.shortfall/);
  });
  it("import page shows assignment line and shortfall warning", () => {
    const page = read("app/admin/import/page.tsx");
    expect(page).toMatch(/assessors to each of/);
    expect(page).toMatch(/assignment\.shortfall > 0/);
  });
  it("assignments page has Auto-assign button posting waveId to /api/assignments/auto", () => {
    const page = read("app/admin/assignments/page.tsx");
    expect(page).toMatch(/\/api\/assignments\/auto/);
    expect(page).toMatch(/JSON\.stringify\(\{ waveId \}\)/);
    expect(page).toMatch(/Auto-assign/);
    expect(read("app/api/assignments/route.ts")).toMatch(/select id, wave_id,/);
  });
});
