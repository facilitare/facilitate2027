"use client";

import { useState, useMemo } from "react";
import Papa from "papaparse";
import { FIELD_DEFS, FieldKey } from "@/lib/import/constants";
import { mapHeaders, HeaderMapping } from "@/lib/import/mapping";

type Report = {
  rowsRead: number;
  rowsValid: number;
  duplicates: { row: number; email: string }[];
  unmapped: { row: number; field: string; value: string }[];
  malformed: { row: number; field: string; value: string; reason: string }[];
  anonymityFlags: { row: number; field: string; reason: string }[];
  unmappedHeaders: string[];
  refCodes?: string[];
  importedCount?: number;
};

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<HeaderMapping | null>(null);
  const [override, setOverride] = useState<Record<string, string | null>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState<"dry" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Effective mapping after override (field -> header)
  const effectiveFieldToHeader = useMemo(() => {
    if (!mapping) return new Map<FieldKey, string>();
    // start from auto
    const auto = mapping.fieldToHeader;
    const eff = new Map<FieldKey, string>(auto);
    // Apply overrides: override[field] = header or null to unmap
    for (const [field, hdr] of Object.entries(override)) {
      if (hdr === null || hdr === "") {
        eff.delete(field as FieldKey);
      } else {
        // remove previous header that mapped to this field? already overwritten
        eff.set(field as FieldKey, hdr);
      }
    }
    // Ensure no duplicate header -> field (if override assigns same header to two fields, keep last)
    // For display we also need to ensure header uniqueness
    return eff;
  }, [mapping, override]);

  const headerToFieldEff = useMemo(() => {
    const m = new Map<string, FieldKey>();
    for (const [f, h] of effectiveFieldToHeader.entries()) m.set(h, f);
    return m;
  }, [effectiveFieldToHeader]);

  const unmappedHeadersEff = useMemo(() => {
    if (!headers.length) return [];
    const used = new Set<string>([...effectiveFieldToHeader.values()]);
    return headers.filter((h) => h.trim() !== "" && !used.has(h));
  }, [headers, effectiveFieldToHeader]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setReport(null);
    setError(null);
    setOverride({});
    if (!f) {
      setHeaders([]);
      setMapping(null);
      setCsvText("");
      return;
    }
    const text = await f.text();
    setCsvText(text);
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const hdr = (parsed.meta.fields as string[]) || [];
    setHeaders(hdr);
    const m = mapHeaders(hdr);
    setMapping(m);
  }

  function handleHeaderOverride(header: string, newField: string) {
    // newField is FieldKey or "" for unmapped
    // Need to update override: find old field for this header, clear it, set new
    const oldField = headerToFieldEff.get(header) ?? null;
    const next: Record<string, string | null> = { ...override };
    if (oldField) {
      // explicitly unmap old field
      next[oldField] = null;
    }
    if (newField && newField !== "__unmapped") {
      next[newField] = header;
      // if another header was mapped to this field, it will be overwritten; need to clear that other header's previous mapping?
      // Find previous header for this field in effective mapping
      const prevHeader = effectiveFieldToHeader.get(newField as FieldKey);
      if (prevHeader && prevHeader !== header) {
        // That prevHeader will become unmapped automatically because we reassign
      }
    }
    // Clean entries where value is null but also not needed? Keep.
    setOverride(next);
  }

  async function doDryRun() {
    if (!file) return;
    setLoading("dry");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Only send override if user changed something
      const hasOverride = Object.keys(override).length > 0;
      if (hasOverride) fd.append("mapping", JSON.stringify(override));
      const res = await fetch("/api/import/dry-run", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dry run failed");
      setReport(data);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(null);
    }
  }

  async function doCommit() {
    if (!file) return;
    setLoading("commit");
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const hasOverride = Object.keys(override).length > 0;
      if (hasOverride) fd.append("mapping", JSON.stringify(override));
      const res = await fetch("/api/import/commit", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setReport(data);
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(null);
    }
  }

  const card: React.CSSProperties = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 20, boxShadow: "var(--shadow-sm)" };
  const stepNum = (n: number, active: boolean): React.CSSProperties => ({ width: 30, height: 30, borderRadius: 999, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14, flexShrink: 0, background: active ? "var(--accent)" : "var(--surface-sunk)", color: active ? "var(--accent-text)" : "var(--text-faint)", border: active ? "none" : "1px solid var(--border)" });
  const bigBtn = (enabled: boolean, primary: boolean): React.CSSProperties => ({ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: enabled ? "pointer" : "not-allowed", opacity: enabled ? 1 : 0.45, background: primary ? "var(--accent)" : "var(--surface)", color: primary ? "var(--accent-text)" : "var(--accent)", border: primary ? "none" : "2px solid var(--accent)" });
  const committed = !!report && (report.importedCount ?? 0) > 0;
  const stat = (label: string, value: number, warn = false) => (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12, background: warn && value > 0 ? "var(--warn-soft)" : "var(--surface-sunk)" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
  const line = (label: string, items: string[]) => (
    <div style={{ fontSize: 13 }}><strong>{label} ({items.length}):</strong> <span style={{ color: "var(--text-muted)" }}>{items.length ? items.join("; ") : "none"}</span></div>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "32px 16px 120px" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "grid", gap: 16 }}>
        <a href="/" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}>← Back to dashboard</a>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>Import applications</h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>Four steps. Nothing is saved until you press <strong>Import</strong> in step 4.</p>

        {/* Step 1 */}
        <section style={{ ...card, display: "flex", gap: 14 }}>
          <div style={stepNum(1, true)}>1</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Download the responses from Google Sheets</div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Open the form responses spreadsheet → <strong>File → Download → Comma-separated values (.csv)</strong>.</div>
          </div>
        </section>

        {/* Step 2 */}
        <section style={{ ...card, display: "flex", gap: 14 }}>
          <div style={stepNum(2, true)}>2</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Choose the CSV file</div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <label style={bigBtn(true, !file)}>
                📂 {file ? "Choose a different file" : "Choose CSV file…"}
                <input type="file" accept=".csv,text/csv" onChange={handleFileChange} style={{ display: "none" }} />
              </label>
              {!file ? <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)" }}>👈 press here</span> : null}
              {file ? <span style={{ fontSize: 14 }}>✓ <strong>{file.name}</strong> <span style={{ color: "var(--text-faint)" }}>({headers.filter((h) => h.trim() !== "").length} columns)</span></span> : <span style={{ fontSize: 14, color: "var(--text-faint)" }}>No file chosen yet</span>}
            </div>
          </div>
        </section>

        {/* Step 3 */}
        <section style={{ ...card, display: "flex", gap: 14 }}>
          <div style={stepNum(3, !!file)}>3</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Check the file</div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Shows what would be imported. Nothing is saved.</div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={doDryRun} disabled={!file || loading !== null} style={bigBtn(!!file && loading === null, !!file && !report)}>
                {loading === "dry" ? "Checking…" : "🔍 Check file"}
              </button>
              {!!file && !report ? <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)" }}>👈 press here</span> : null}
            </div>
          </div>
        </section>

        {report ? (
          <section style={{ ...card, borderColor: committed ? "var(--score-2)" : "var(--border)", background: committed ? "var(--score-2-soft)" : "var(--surface)" }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{committed ? `✅ Imported ${report.importedCount} application(s)` : "Check result — nothing saved yet"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 12 }}>
              {stat("Rows in file", report.rowsRead)}
              {stat("Ready to import", report.rowsValid)}
              {stat("Already imported (skipped)", report.duplicates.length, true)}
              {stat("Rows with errors", report.malformed.length, true)}
            </div>
            <div style={{ display: "grid", gap: 6, marginTop: 14 }}>
              {line("Optional — answers that mention a name or website (assessors will see them as written)", report.anonymityFlags.map((a) => `row ${a.row} ${a.field}: ${a.reason}`))}
              {line("Answers under “Other”", report.unmapped.map((u) => `row ${u.row}: ${u.value}`))}
              {report.malformed.length ? line("Errors", report.malformed.map((m) => `row ${m.row} ${m.field}="${m.value}" (${m.reason})`)) : null}
              {report.refCodes && report.refCodes.length ? line("Reference codes", report.refCodes) : null}
            </div>
            {committed ? <a href="/admin/assignments" style={{ ...bigBtn(true, true), marginTop: 16, textDecoration: "none" }}>Next: assign to assessors →</a> : null}
          </section>
        ) : null}

        {/* Step 4 */}
        <section style={{ ...card, display: "flex", gap: 14 }}>
          <div style={stepNum(4, !!report && !committed)}>4</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Import</div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 4 }}>Saves the applications. Applicants already imported (same email) are skipped, so it is safe to import the same sheet again later.</div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={doCommit} disabled={!report || committed || loading !== null} style={bigBtn(!!report && !committed && loading === null, true)} title={!report ? "Check the file first (step 3)" : undefined}>
                {loading === "commit" ? "Importing…" : committed ? "✓ Imported" : "⬆ Import applications"}
              </button>
              {!!report && !committed ? <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)" }}>👈 press here</span> : null}
            </div>
          </div>
        </section>

        {error ? <div style={{ ...card, borderColor: "var(--danger)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: 14 }}>{error}</div> : null}

        {headers.length > 0 && mapping ? (
          <details style={card}>
            <summary style={{ cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Advanced: how form columns are matched ({unmappedHeadersEff.length} column(s) ignored)</summary>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Only change this if a form question shows as &ldquo;ignored&rdquo; but should be imported.</p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--surface-sunk)", textAlign: "left" }}>
                    <th style={{ padding: 6 }}>Form column</th>
                    <th style={{ padding: 6 }}>Imported as</th>
                  </tr>
                </thead>
                <tbody>
                  {headers.filter((h) => h.trim() !== "").map((h, idx) => {
                    const effField = headerToFieldEff.get(h) ?? null;
                    return (
                      <tr key={h + idx} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={{ padding: 6, maxWidth: 380 }} title={h}>{h.slice(0, 70)}{h.length > 70 ? "…" : ""}</td>
                        <td style={{ padding: 6 }}>
                          <select value={effField ?? "__unmapped"} onChange={(e) => handleHeaderOverride(h, e.target.value)} style={{ fontSize: 12, padding: 4, borderRadius: 6, border: "1px solid var(--border)", background: effField ? "var(--surface)" : "var(--warn-soft)", color: "var(--text)" }}>
                            <option value="__unmapped">— ignored —</option>
                            {FIELD_DEFS.map((d) => (
                              <option key={d.field} value={d.field}>{d.field}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </div>
    </main>
  );
}
