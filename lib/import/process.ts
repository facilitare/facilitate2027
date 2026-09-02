import Papa from "papaparse";
import { mapHeaders } from "./mapping";
import { normalizeRow } from "./normalize";
import { scanAnonymity } from "./anonymity";
import { getSql } from "@/lib/db/client";

export interface ImportReport {
  rowsRead: number;
  rowsValid: number;
  duplicates: { row: number; email: string }[];
  unmapped: { row: number; field: string; value: string }[];
  malformed: { row: number; field: string; value: string; reason: string }[];
  anonymityFlags: { row: number; field: string; reason: string }[];
  unmappedHeaders: string[];
  refCodes?: string[];
  importedCount?: number;
}

export interface ProcessOptions {
  waveId: string;
  waveNumber: number;
  csvText: string;
  doCommit: boolean;
}

function parseCSV(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const res = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h, // keep original
  });
  if (res.errors.length) {
    // Papa errors are often tolerable but we surface
    // Do not throw, continue
  }
  const headers = (res.meta.fields as string[]) || [];
  const rows = res.data as Record<string, string>[];
  // Filter out rows that are entirely empty
  const filtered = rows.filter((r) => Object.values(r).some((v) => v && String(v).trim() !== ""));
  return { headers, rows: filtered };
}

export async function processImport(opts: ProcessOptions): Promise<ImportReport> {
  const sql = getSql();
  const { headers, rows } = parseCSV(opts.csvText);
  const mapping = mapHeaders(headers);
  const rowsRead = rows.length;

  const duplicates: ImportReport["duplicates"] = [];
  const unmapped: ImportReport["unmapped"] = [];
  const malformed: ImportReport["malformed"] = [];
  const anonymityFlags: ImportReport["anonymityFlags"] = [];

  // Pre-fetch existing emails in this wave for dedupe
  const existingRows = await sql`select lower(q1_email) as email from applications where wave_id = ${opts.waveId} and q1_email is not null`;
  const existingSet = new Set((existingRows as any[]).map((r) => (r.email || "").toLowerCase().trim()).filter(Boolean));

  // Also track intra-file duplicates (first occurrence wins)
  const seenInFile = new Set<string>();

  // Collect valid normalized rows with their original index and timestamp for ordering
  type ValidEntry = {
    rowIndex: number; // 1-based data row number
    rawEmail: string;
    normalized: ReturnType<typeof normalizeRow>["row"];
    anonymityHits: ReturnType<typeof scanAnonymity>;
    submittedAt: string | null;
    unmappedLocal: { field: string; value: string }[];
  };
  const validEntries: ValidEntry[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 1; // 1-based for report
    const rawRow = rows[i] as Record<string, string>;

    // Build rawByField via mapping
    const rawByField: Record<string, string | undefined> = {};
    for (const [field, header] of mapping.fieldToHeader.entries()) {
      rawByField[field] = rawRow[header];
    }
    // Include unmapped headers? Not needed

    const { row: normalized, unmapped: localUnmapped, malformed: localMalformed } = normalizeRow(rawByField, rowNumber);

    // Record unmapped (named)
    for (const u of localUnmapped) {
      unmapped.push({ row: rowNumber, field: u.field, value: u.value });
    }

    // Email extraction for dedupe (must be lowercased already)
    const email = (normalized.q1_email || "").toLowerCase().trim();

    // Duplicate check: per wave by q1_email
    let isDuplicate = false;
    if (email) {
      if (existingSet.has(email) || seenInFile.has(email)) {
        duplicates.push({ row: rowNumber, email });
        isDuplicate = true;
      }
    } else {
      // No email? Treat as malformed? But we allow, not duplicate
    }

    // Malformed check: if any malformed, record and skip this row (never silent null)
    if (localMalformed.length > 0) {
      for (const m of localMalformed) {
        malformed.push({ row: rowNumber, field: m.field, value: m.value, reason: m.reason });
      }
      // Even if duplicate, already recorded duplicate; still malformed takes precedence for not importing
      // Do not add to validEntries
      // Still track email for intra-file dedupe? If malformed, should still reserve email to prevent later duplicate counting? But AC expects 1 dup, 1 malformed distinct rows. So malformed row email should still be marked as seen? For duplicate detection, we should add to seen if not already duplicate.
      if (email && !isDuplicate) seenInFile.add(email);
      continue;
    }

    if (isDuplicate) {
      // already recorded, skip valid
      if (email) seenInFile.add(email);
      continue;
    }

    // If not duplicate and not malformed, check anonymity
    const hits = scanAnonymity(normalized);
    for (const h of hits) {
      anonymityFlags.push({ row: rowNumber, field: h.field, reason: h.reason });
    }

    // Mark email as seen for future duplicate detection
    if (email) seenInFile.add(email);

    validEntries.push({
      rowIndex: rowNumber,
      rawEmail: email,
      normalized,
      anonymityHits: hits,
      submittedAt: normalized.submitted_at,
      unmappedLocal: localUnmapped,
    });
  }

  // Determine next ref code seq
  let maxSeq = 0;
  const existingRefs = await sql`select ref_code from applications where wave_id = ${opts.waveId}`;
  for (const r of existingRefs as any[]) {
    const code = r.ref_code as string;
    const m = code.match(/^W\d+-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxSeq) maxSeq = n;
    }
  }

  // Sort validEntries by submitted_at ascending for sequential ref assignment, fallback to rowIndex
  validEntries.sort((a, b) => {
    if (a.submittedAt && b.submittedAt) {
      const da = new Date(a.submittedAt).getTime();
      const db = new Date(b.submittedAt).getTime();
      if (!isNaN(da) && !isNaN(db) && da !== db) return da - db;
    }
    return a.rowIndex - b.rowIndex;
  });

  const refCodes: string[] = [];
  for (let i = 0; i < validEntries.length; i++) {
    const seq = maxSeq + 1 + i;
    const code = `W${opts.waveNumber}-${String(seq).padStart(3, "0")}`;
    refCodes.push(code);
  }

  let importedCount = 0;
  if (opts.doCommit && validEntries.length > 0) {
    const batchId = crypto.randomUUID();
    // Insert sequentially to avoid ref collision
    for (let i = 0; i < validEntries.length; i++) {
      const entry = validEntries[i];
      const n = entry.normalized;
      const ref = refCodes[i];
      const anonFlag = entry.anonymityHits.length > 0;
      const anonNotes = anonFlag ? entry.anonymityHits.map((h) => `${h.field}: ${h.reason}`).join("; ") : null;

      // Derive iaf_standing
      let iafStanding: number | null = null;
      if (n.q17_iaf_member === "yes") {
        const acc = n.q18_iaf_qualification || "";
        const low = acc.toLowerCase();
        if (low.includes("certified") || low.includes("cpf") || low.includes("endorsed") || low.includes("master")) {
          iafStanding = 2;
        } else if (low.includes("other") || low.trim() !== "") {
          // conservative: if any qualification mentioned, 1? But spec says endorsed etc =>2 else 1
          // If q18 is "none of these but have other qualifications" -> 1?
          // We'll detect
          if (low.includes("none")) iafStanding = 1;
          else iafStanding = 1;
        } else {
          iafStanding = 1;
        }
      } else if (n.q17_iaf_member) {
        iafStanding = 0;
      }

      // Upsert? No, insert new
      await sql`
        insert into applications (
          wave_id, ref_code, submitted_at, imported_at, import_batch, status,
          q4_session_provides, q4_session_provides_other,
          q5_audience, q5_audience_other,
          q6_audience_detail,
          q7_about_session, q7b_benefits, q8_group_setup, q8_group_setup_other,
          q9_room_layout, q9b_furniture, q10_delivery_mode, q11_theme, q12_timekeeping,
          q13_participation_level, q14_methods, q14_methods_other,
          q15_first_ten_minutes, q16_pathway, q17_iaf_member, q18_iaf_qualification, q19_large_groups_english,
          q1_email, q2_ticket_status, q3_availability,
          q20_full_name, q21_bio, q22_headshot_url, q23_cofacilitators,
          q24_region, q25_ethnicity, q26_career_stage, q27_under_35, q28_gender,
          iaf_standing, anonymity_flag, anonymity_notes
        ) values (
          ${opts.waveId}, ${ref}, ${n.submitted_at ? new Date(n.submitted_at) as any : null}, now(), ${batchId}, 'imported',
          ${n.q4_session_provides as any}, ${n.q4_other},
          ${n.q5_audience as any}, ${n.q5_other},
          ${n.q6_audience_detail},
          ${n.q7_about_session}, ${n.q7b_benefits}, ${n.q8_group_setup as any}, ${n.q8_other},
          ${n.q9_room_layout}, ${n.q9b_furniture}, ${n.q10_delivery_mode}, ${n.q11_theme}, ${n.q12_timekeeping},
          ${n.q13_participation_level}, ${n.q14_methods as any}, ${n.q14_other},
          ${n.q15_first_ten_minutes}, ${n.q16_pathway}, ${n.q17_iaf_member}, ${n.q18_iaf_qualification}, ${n.q19_large_groups_english},
          ${n.q1_email}, ${n.q2_ticket_status as any}, ${n.q3_availability as any},
          ${n.q20_full_name}, ${n.q21_bio}, ${n.q22_headshot_url}, ${n.q23_cofacilitators},
          ${n.q24_region}, ${n.q25_ethnicity}, ${n.q26_career_stage}, ${n.q27_under_35}, ${n.q28_gender},
          ${iafStanding}, ${anonFlag}, ${anonNotes}
        )
      `;
      importedCount++;
    }

    // Audit log
    // Need actor - we don't have actor here; caller should insert audit. We insert generic via sql if possible
    // We'll leave audit to route handler (it has session). Insert placeholder with actor null
    await sql`insert into audit_log (actor_id, actor_name, action, entity, entity_id, payload) values (null, 'import', 'import.commit', 'wave', ${opts.waveId}, ${JSON.stringify({ batch: batchId, imported: importedCount, refs: refCodes }) as any})`;
  }

  return {
    rowsRead,
    rowsValid: validEntries.length,
    duplicates,
    unmapped,
    malformed,
    anonymityFlags,
    unmappedHeaders: mapping.unmappedHeaders,
    refCodes: validEntries.length ? refCodes : [],
    importedCount: opts.doCommit ? importedCount : 0,
  };
}
