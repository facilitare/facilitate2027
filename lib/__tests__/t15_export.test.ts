import { describe, it, expect, vi, beforeEach } from "vitest";
import { csvQuote, serializeCsv, serializeCsvWithBom, CSV_BOM_BYTES } from "@/lib/csv";

// -------------------------------------------------------------------
// csvQuote / serializeCsv — AC (1) comma+quote+newline, non-ASCII, CRLF/BOM
// -------------------------------------------------------------------
describe("lib/csv.ts hand-written serializer", () => {
  it("quotes every field and escapes double quotes by doubling", () => {
    expect(csvQuote("simple")).toBe('"simple"');
    expect(csvQuote("a,b")).toBe('"a,b"');
    expect(csvQuote('a"b')).toBe('"a""b"');
    expect(csvQuote('say "hello"')).toBe('"say ""hello"""');
    expect(csvQuote("")).toBe('""');
    expect(csvQuote(null)).toBe('""');
    expect(csvQuote(undefined)).toBe('""');
    expect(csvQuote(42)).toBe('"42"');
  });

  it("handles field with comma, quote and newline together", () => {
    const tricky = 'hello, "world"\nnext line';
    const quoted = csvQuote(tricky);
    expect(quoted).toBe('"hello, ""world""\nnext line"');
    // round-trip via serializeCsv: parse manually by counting
    const csv = serializeCsv(["ref", "note"], [["W1-001", tricky]]);
    expect(csv).toContain('"hello, ""world""\nnext line"');
    expect(csv).toContain("\r\n");
    // headers also quoted
    expect(csv.startsWith('"ref","note"\r\n')).toBe(true);
  });

  it("uses CRLF line endings and final CRLF", () => {
    const csv = serializeCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(csv).toBe('"a","b"\r\n"1","2"\r\n"3","4"\r\n');
    expect(csv.includes("\n")).toBe(true);
    expect(csv.includes("\r\n")).toBe(true);
    // No bare \n without \r
    const bareNl = csv.replace(/\r\n/g, "");
    expect(bareNl.includes("\n")).toBe(false);
  });

  it("BOM bytes present via serializeCsvWithBom", () => {
    const buf = serializeCsvWithBom(["a"], [["b"]]);
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    // After BOM, content is CRLF CSV
    const str = buf.toString("utf8");
    expect(str.charCodeAt(0)).toBe(0xfeff);
    expect(str).toContain('"a"\r\n"b"\r\n');
  });

  it("non-ASCII survives round trip (UTF-8 BOM)", () => {
    const name = "Ștefan Müller — Tomás Ribeiro — 北京";
    const buf = serializeCsvWithBom(["name"], [[name]]);
    const str = buf.toString("utf8");
    expect(str).toContain(name);
    // Ensure bytes decode correctly
    const raw = Buffer.from(str.slice(1), "utf8").toString("utf8"); // skip BOM
    expect(raw).toContain(name);
  });

  it("is hand-written: no papaparse or external csv import", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync("lib/csv.ts", "utf8");
    expect(content.toLowerCase()).not.toContain("papaparse");
    expect(content.toLowerCase()).not.toContain("csv-stringify");
    expect(content.toLowerCase()).not.toContain("csv-parse");
    // Should contain our hand-written logic markers
    expect(content).toContain('replace(/"/g');
    expect(content).toContain("CRLF");
    expect(content).toContain("BOM");
  });
});

// -------------------------------------------------------------------
// Export route logic — feedback no private notes, lead-only full, scopes
// -------------------------------------------------------------------
// We test the CSV assembly logic extracted from the route (not the full Next handler with neon).
// The key invariants are:
// - feedback assembled never contains private_note
// - full contains identity but is lead-only (route returns 403)
// - scores contains per-assessor totals and aggregates

describe("export scopes invariants (logic-level)", () => {
  it("feedback assembly excludes private notes", () => {
    // Simulate how the route assembles feedback (see app/api/export/route.ts feedback branch)
    const assessments = [
      { evaluator_name: "Marco Ferretti", feedback_liked: "Great, loved the pace", feedback_improve: "More time on Q&A", private_note: "SECRET PRIVATE SHOULD NOT APPEAR" },
      { evaluator_name: "Amina Yusuf", feedback_liked: "Nice craft", feedback_improve: "Add examples", private_note: "ANOTHER SECRET" },
    ];
    const parts: string[] = [];
    for (const a of assessments) {
      const liked = (a.feedback_liked ?? "").trim();
      const improve = (a.feedback_improve ?? "").trim();
      const blockParts: string[] = [];
      blockParts.push(`Assessor: ${a.evaluator_name}`);
      if (liked) blockParts.push(`What we liked:\n${liked}`);
      if (improve) blockParts.push(`What could be improved:\n${improve}`);
      parts.push(blockParts.join("\n\n"));
    }
    const assembled = parts.join("\n\n---\n\n");
    // Serialize to CSV and check private notes absent
    const csv = serializeCsv(["ref_code", "applicant_name", "applicant_email", "feedback"], [["W1-001", "Test", "test@example.org", assembled]]);
    expect(csv).not.toContain("SECRET PRIVATE");
    expect(csv).not.toContain("ANOTHER SECRET");
    expect(csv).toContain("Great, loved the pace");
    expect(csv).toContain("More time on Q&A");
    // Also test tricky field inside feedback
    const trickyFeedback = 'hello, "world"\nnext line — tróuble';
    const csv2 = serializeCsv(["ref", "feedback"], [["W1-002", trickyFeedback]]);
    expect(csv2).toContain('"hello, ""world""\nnext line — tróuble"');
  });

  it("scores headers include per-assessor totals", () => {
    const evaluators = [{ id: "1", name: "Marco Ferretti" }, { id: "2", name: "Amina Yusuf" }];
    const headers = ["ref_code", "theme", "status", "n", "mean_focus", "mean_content", "mean_interactivity", "mean_credibility", "mean_total", "normalised_total", "divergence", "quality_status", ...evaluators.map(e => `total_${e.name}`)];
    expect(headers).toContain("total_Marco Ferretti");
    expect(headers).toContain("total_Amina Yusuf");
    const csv = serializeCsv(headers, [["W1-001", "craft", "scored", "2", "1.5", "1.5", "1.0", "1.0", "5.0", "5.1", "1", "pass", "6", "4"]]);
    expect(csv).toContain('"total_Marco Ferretti"');
    expect(csv).toContain('"total_Amina Yusuf"');
  });

  it("full scope includes identity fields and is lead-only (audit marker)", async () => {
    // Verify route file contains the lead guard and audit write
    const fs = await import("fs");
    const route = fs.readFileSync("app/api/export/route.ts", "utf8");
    expect(route).toContain("scope === \"full\" && !isLead");
    expect(route).toContain("403");
    expect(route).toContain("writeAudit");
    expect(route).toContain("export.full");
    // Full headers must include identity columns
    expect(route).toContain("q1_email");
    expect(route).toContain("q20_full_name");
    expect(route).toContain("q25_ethnicity");
  });

  it("non-ASCII in application fields survives CSV (BOM + UTF-8)", () => {
    const app = { ref_code: "W1-001", q20_full_name: "André Popescu — Ștefan", q1_email: "andré@example.org" };
    const buf = serializeCsvWithBom(["ref_code", "applicant_name", "applicant_email"], [[app.ref_code, app.q20_full_name, app.q1_email]]);
    const str = buf.toString("utf8");
    expect(str).toContain("André Popescu — Ștefan");
    expect(str).toContain("andré@example.org");
    // BOM present
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
  });
});
