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

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">CSV Import</h1>
      <p className="text-sm text-muted-foreground">
        Upload a Google Forms CSV export. Headers are fuzzy-matched on the first 40 characters (case-insensitive). Multi-select values are split on &quot;, &quot;, enums are normalised (lowercase, non-alnum → _). Duplicates are detected by <code>q1_email</code> per wave. Ref codes <code>W1-001…</code> are assigned in submission order.
      </p>

      <div className="border rounded-lg p-4 space-y-4 bg-card">
        <label className="block">
          <span className="text-sm font-medium">CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="mt-1 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
          />
        </label>
        {headers.length > 0 && (
          <div className="text-xs text-muted-foreground">{headers.length} columns detected, {headers.filter(h=>h.trim()!=="").length} non-empty headers</div>
        )}
      </div>

      {headers.length > 0 && mapping && (
        <div className="border rounded-lg p-4 space-y-4 bg-card">
          <h2 className="text-lg font-medium">Mapping — auto-matched with manual override</h2>
          <p className="text-xs text-muted-foreground">
            Auto-matching uses first 40 chars, case-insensitive, starts-with fuzzy. Use the dropdown to override. Unmapped headers will be ignored; unmapped multi-select values go to <code>_other</code> and appear in the report.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">CSV Header (first 60 chars)</th>
                  <th className="text-left p-2">Auto-matched field</th>
                  <th className="text-left p-2">Manual override</th>
                </tr>
              </thead>
              <tbody>
                {headers.filter(h=>h.trim()!=="").map((h, idx) => {
                  const autoField = mapping.headerToField.get(h) ?? null;
                  const effField = headerToFieldEff.get(h) ?? null;
                  return (
                    <tr key={h+idx} className="border-b">
                      <td className="p-2 text-xs">{idx+1}</td>
                      <td className="p-2 font-mono text-xs max-w-[360px] truncate" title={h}>{h.slice(0,60)}{h.length>60?"…":""}</td>
                      <td className="p-2 text-xs">{autoField ? <span className="px-2 py-1 rounded bg-green-100 text-green-800">{autoField}</span> : <span className="px-2 py-1 rounded bg-amber-100 text-amber-800">unmapped</span>}</td>
                      <td className="p-2">
                        <select
                          value={effField ?? "__unmapped"}
                          onChange={(e) => handleHeaderOverride(h, e.target.value)}
                          className="border rounded px-2 py-1 text-xs w-[220px]"
                        >
                          <option value="__unmapped">— unmapped —</option>
                          {FIELD_DEFS.map((d) => (
                            <option key={d.field} value={d.field}>{d.field} ({d.type})</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {unmappedHeadersEff.length > 0 && (
            <div className="text-xs">
              <span className="font-medium">Unmapped headers ({unmappedHeadersEff.length}):</span>{" "}
              <span className="font-mono">{unmappedHeadersEff.join(" | ").slice(0,300)}</span>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={doDryRun}
              disabled={loading !== null}
              className="px-4 py-2 rounded bg-secondary text-secondary-foreground border hover:bg-secondary/80 disabled:opacity-50"
            >
              {loading === "dry" ? "Running…" : "Dry run"}
            </button>
            <button
              onClick={doCommit}
              disabled={loading !== null || !report}
              className="px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              title={!report ? "Run dry-run first" : undefined}
            >
              {loading === "commit" ? "Importing…" : "Import"}
            </button>
          </div>
          {error && <div className="text-sm text-red-600 border border-red-200 bg-red-50 p-2 rounded">{error}</div>}
        </div>
      )}

      {report && (
        <div className="border rounded-lg p-4 space-y-3 bg-card">
          <h2 className="text-lg font-medium">Report {report.importedCount !== undefined && report.importedCount > 0 ? "(committed)" : "(dry-run)"}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div className="border rounded p-3">
              <div className="text-muted-foreground">Rows read</div>
              <div className="text-xl font-semibold">{report.rowsRead}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-muted-foreground">Valid rows</div>
              <div className="text-xl font-semibold">{report.rowsValid}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-muted-foreground">Imported</div>
              <div className="text-xl font-semibold">{report.importedCount ?? 0}</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-muted-foreground">Unmapped headers</div>
              <div className="text-xl font-semibold">{report.unmappedHeaders.length}</div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Duplicates ({report.duplicates.length}):</span>{" "}
              {report.duplicates.length === 0 ? <span className="text-muted-foreground">none</span> : report.duplicates.map((d) => `row ${d.row} ${d.email}`).join(", ")}
            </div>
            <div>
              <span className="font-medium">Unmapped values ({report.unmapped.length}):</span>{" "}
              {report.unmapped.length === 0 ? <span className="text-muted-foreground">none</span> : report.unmapped.map((u) => `row ${u.row} ${u.field}="${u.value}"`).join(", ")}
            </div>
            <div>
              <span className="font-medium">Malformed enums ({report.malformed.length}):</span>{" "}
              {report.malformed.length === 0 ? <span className="text-muted-foreground">none</span> : report.malformed.map((m) => `row ${m.row} ${m.field}="${m.value}" (${m.reason})`).join(", ")}
            </div>
            <div>
              <span className="font-medium">Anonymity flags ({report.anonymityFlags.length}):</span>{" "}
              {report.anonymityFlags.length === 0 ? <span className="text-muted-foreground">none</span> : report.anonymityFlags.map((a) => `row ${a.row} ${a.field}: ${a.reason}`).join("; ")}
            </div>
            {report.refCodes && report.refCodes.length > 0 && (
              <div>
                <span className="font-medium">Ref codes:</span> {report.refCodes.join(", ")}
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-2">
              Anonymity scan is heuristic — name tokens (≥3 chars), email local part (≥4 chars), URLs/domains, self-reference (&quot;I am …&quot;, &quot;my company/firm/consultancy&quot;). Flagged applications require redaction or dismissal before assignment.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
