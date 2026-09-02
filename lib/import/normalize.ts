import {
  normalizeEnumValue,
  ENUM_MAPS,
  ALLOWED_ENUMS,
  deriveRegion,
  KNOWN_Q4,
  KNOWN_Q5,
  KNOWN_Q8,
  KNOWN_Q14,
  KNOWN_Q2,
  KNOWN_Q3,
} from "./constants";

export interface NormalizedRow {
  submitted_at: string | null;
  q1_email: string | null;
  q2_ticket_status: string[] | null;
  q2_other?: string | null;
  q3_availability: string[] | null;
  q3_other?: string | null;
  q4_session_provides: string[] | null;
  q4_other: string | null;
  q5_audience: string[] | null;
  q5_other: string | null;
  q6_audience_detail: string | null;
  q7_about_session: string | null;
  q7b_benefits: string | null;
  q8_group_setup: string[] | null;
  q8_other: string | null;
  q9_room_layout: string | null;
  q9b_furniture: string | null;
  q10_delivery_mode: string | null;
  q11_theme: string | null;
  q12_timekeeping: string | null;
  q13_participation_level: number | null;
  q14_methods: string[] | null;
  q14_other: string | null;
  q15_first_ten_minutes: string | null;
  q16_pathway: string | null;
  q17_iaf_member: string | null;
  q18_iaf_qualification: string | null;
  q19_large_groups_english: string | null;
  q20_full_name: string | null;
  q21_bio: string | null;
  q22_headshot_url: string | null;
  q23_cofacilitators: string | null;
  q24_region: string | null;
  q24_raw: string | null;
  q25_ethnicity: string | null;
  q26_career_stage: string | null;
  q27_under_35: boolean | null;
  q28_gender: string | null;
}

export interface NormalizeResult {
  row: NormalizedRow;
  unmapped: { field: string; value: string }[];
  malformed: { field: string; value: string; reason: string }[];
}

function splitMulti(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const s = raw.trim();
  if (!s) return [];
  // Google joins checkbox with ", " but sample uses ";"
  // Split on ; first if present, else on ", " - but robust: split on both
  // Use regex: split on ';' or ',' followed by space
  // Preserve values that contain commas not as separators? spec says split on ', '
  let parts: string[];
  if (s.includes(";")) {
    parts = s.split(";").map((p) => p.trim()).filter(Boolean);
  } else if (s.includes(",")) {
    // split on ", " (comma + space) per spec, not bare comma
    // but also fallback to ','
    parts = s.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
  } else {
    parts = [s];
  }
  // Further split if any part still contains ", " after semicolon split
  const out: string[] = [];
  for (const p of parts) {
    if (p.includes(", ") && !p.includes(";")) {
      out.push(...p.split(", ").map((x) => x.trim()).filter(Boolean));
    } else {
      out.push(p);
    }
  }
  return out;
}

function partitionKnown(values: string[], known: string[]): { known: string[]; unknown: string[] } {
  const knownSet = new Set(known.map((k) => k.toLowerCase()));
  const knownOut: string[] = [];
  const unknownOut: string[] = [];
  for (const v of values) {
    const low = v.toLowerCase().trim();
    // allow substring prefix match? stricter exact lower
    if (knownSet.has(low)) {
      knownOut.push(v);
    } else {
      // try fuzzy: normalized known includes value or vice versa? Keep strict for unmapped detection
      // Check if any known contains this value as substring or vice versa with length >10
      let found = false;
      for (const k of known) {
        if (low === k) { found = true; break; }
        // for q14 long strings, exact match required
      }
      if (found) knownOut.push(v);
      else unknownOut.push(v);
    }
  }
  return { known: knownOut, unknown: unknownOut };
}

function normalizeEnum(field: string, raw: string | null | undefined): { value: string | null; error?: string } {
  if (raw == null || raw.trim() === "") {
    return { value: null, error: "empty value" };
  }
  const norm = normalizeEnumValue(raw);
  // Special handling for q11: contains craft etc.
  if (field === "q11_theme") {
    const low = raw.toLowerCase();
    for (const t of ["craft", "clarity", "change", "challenge"]) {
      if (low.includes(t)) return { value: t };
    }
    // also try normalized
    if (ALLOWED_ENUMS[field].has(norm)) return { value: norm };
    return { value: null, error: `value '${raw}' not in allowed set` };
  }
  // Try alias map
  const map = ENUM_MAPS[field];
  if (map) {
    if (map[norm]) return { value: map[norm] };
    // For q17 not_sure variants
    if (field === "q17_iaf_member" && (norm === "not_sure" || norm === "notsure" || norm.includes("not_sure"))) {
      return { value: "not_sure" };
    }
    if (ALLOWED_ENUMS[field]?.has(norm)) return { value: norm };
    return { value: null, error: `value '${raw}' not in allowed set` };
  }
  if (ALLOWED_ENUMS[field]?.has(norm)) return { value: norm };
  return { value: null, error: `value '${raw}' not in allowed set` };
}

function parseBoolean(raw: string | null | undefined): { value: boolean | null; error?: string } {
  if (raw == null || raw.trim() === "") return { value: null };
  const low = raw.trim().toLowerCase();
  if (["yes", "true", "1", "y"].includes(low)) return { value: true };
  if (["no", "false", "0", "n"].includes(low)) return { value: false };
  // Also handle "no" with extra
  if (low.startsWith("yes")) return { value: true };
  if (low.startsWith("no")) return { value: false };
  return { value: null, error: `invalid boolean '${raw}'` };
}

function parseIntField(raw: string | null | undefined): { value: number | null; error?: string } {
  if (raw == null || raw.trim() === "") return { value: null };
  const n = parseInt(raw.trim(), 10);
  if (isNaN(n)) return { value: null, error: `not an integer '${raw}'` };
  return { value: n };
}

export function normalizeRow(
  rawByField: Record<string, string | undefined>,
  rowIndex: number
): NormalizeResult {
  const unmapped: { field: string; value: string }[] = [];
  const malformed: { field: string; value: string; reason: string }[] = [];

  const get = (f: string): string | null => {
    const v = rawByField[f];
    if (v == null) return null;
    const t = v.trim();
    return t === "" ? null : t;
  };

  const row: NormalizedRow = {
    submitted_at: null,
    q1_email: null,
    q2_ticket_status: null,
    q2_other: null,
    q3_availability: null,
    q3_other: null,
    q4_session_provides: null,
    q4_other: null,
    q5_audience: null,
    q5_other: null,
    q6_audience_detail: null,
    q7_about_session: null,
    q7b_benefits: null,
    q8_group_setup: null,
    q8_other: null,
    q9_room_layout: null,
    q9b_furniture: null,
    q10_delivery_mode: null,
    q11_theme: null,
    q12_timekeeping: null,
    q13_participation_level: null,
    q14_methods: null,
    q14_other: null,
    q15_first_ten_minutes: null,
    q16_pathway: null,
    q17_iaf_member: null,
    q18_iaf_qualification: null,
    q19_large_groups_english: null,
    q20_full_name: null,
    q21_bio: null,
    q22_headshot_url: null,
    q23_cofacilitators: null,
    q24_region: null,
    q24_raw: null,
    q25_ethnicity: null,
    q26_career_stage: null,
    q27_under_35: null,
    q28_gender: null,
  };

  // submitted_at
  const tsRaw = get("submitted_at");
  if (tsRaw) {
    // try parse; keep original string for ordering, store as ISO if parseable
    const d = new Date(tsRaw);
    row.submitted_at = isNaN(d.getTime()) ? tsRaw : d.toISOString();
  }

  // q1_email
  row.q1_email = get("q1_email");
  if (row.q1_email) row.q1_email = row.q1_email.trim().toLowerCase();

  // q4
  {
    const raw = get("q4_session_provides");
    if (raw) {
      const parts = splitMulti(raw);
      const { known, unknown } = partitionKnown(parts, KNOWN_Q4);
      row.q4_session_provides = known.length ? known : null;
      row.q4_other = unknown.length ? unknown.join("; ") : null;
      for (const u of unknown) unmapped.push({ field: "q4_session_provides", value: u });
    }
  }
  // q5
  {
    const raw = get("q5_audience");
    if (raw) {
      const parts = splitMulti(raw);
      const { known, unknown } = partitionKnown(parts, KNOWN_Q5);
      row.q5_audience = known.length ? known : null;
      row.q5_other = unknown.length ? unknown.join("; ") : null;
      for (const u of unknown) unmapped.push({ field: "q5_audience", value: u });
    }
  }
  // q6
  row.q6_audience_detail = get("q6_audience_detail");
  // q7 etc
  row.q7_about_session = get("q7_about_session");
  row.q7b_benefits = get("q7b_benefits");
  // q8
  {
    const raw = get("q8_group_setup");
    if (raw) {
      const parts = splitMulti(raw);
      const { known, unknown } = partitionKnown(parts, KNOWN_Q8);
      row.q8_group_setup = known.length ? known : null;
      row.q8_other = unknown.length ? unknown.join("; ") : null;
      for (const u of unknown) unmapped.push({ field: "q8_group_setup", value: u });
    }
  }
  row.q9_room_layout = get("q9_room_layout");
  row.q9b_furniture = get("q9b_furniture");

  // q10 enum
  {
    const raw = get("q10_delivery_mode");
    if (raw != null) {
      const { value, error } = normalizeEnum("q10_delivery_mode", raw);
      if (error) {
        malformed.push({ field: "q10_delivery_mode", value: raw, reason: error });
      } else {
        row.q10_delivery_mode = value;
      }
    } else {
      row.q10_delivery_mode = null;
    }
  }
  // q11 enum - required, malformed if missing/invalid
  {
    const raw = get("q11_theme");
    if (raw == null) {
      malformed.push({ field: "q11_theme", value: "", reason: "empty value" });
      row.q11_theme = null;
    } else {
      const { value, error } = normalizeEnum("q11_theme", raw);
      if (error) {
        malformed.push({ field: "q11_theme", value: raw, reason: error });
        row.q11_theme = null;
      } else {
        row.q11_theme = value;
      }
    }
  }
  row.q12_timekeeping = get("q12_timekeeping");

  // q13 int 1-5, LIVE MISSING nullable, but if present must be 1-5
  {
    const raw = get("q13_participation_level");
    if (raw != null) {
      const { value, error } = parseIntField(raw);
      if (error) {
        malformed.push({ field: "q13_participation_level", value: raw, reason: error });
      } else if (value != null && (value < 1 || value > 5)) {
        malformed.push({ field: "q13_participation_level", value: raw, reason: "must be 1-5" });
      } else {
        row.q13_participation_level = value;
      }
    }
  }

  // q14
  {
    const raw = get("q14_methods");
    if (raw) {
      const parts = splitMulti(raw);
      const { known, unknown } = partitionKnown(parts, KNOWN_Q14);
      row.q14_methods = known.length ? known : null;
      row.q14_other = unknown.length ? unknown.join("; ") : null;
      for (const u of unknown) unmapped.push({ field: "q14_methods", value: u });
    }
  }
  row.q15_first_ten_minutes = get("q15_first_ten_minutes");
  row.q16_pathway = get("q16_pathway");

  // q17 enum
  {
    const raw = get("q17_iaf_member");
    if (raw != null) {
      const { value, error } = normalizeEnum("q17_iaf_member", raw);
      if (error) {
        malformed.push({ field: "q17_iaf_member", value: raw, reason: error });
      } else {
        row.q17_iaf_member = value;
      }
    }
  }
  row.q18_iaf_qualification = get("q18_iaf_qualification");
  row.q19_large_groups_english = get("q19_large_groups_english");
  row.q20_full_name = get("q20_full_name");
  row.q21_bio = get("q21_bio");
  row.q22_headshot_url = get("q22_headshot_url");
  row.q23_cofacilitators = get("q23_cofacilitators");

  // q24 country -> region
  {
    const raw = get("q24_region");
    row.q24_raw = raw;
    if (raw) {
      row.q24_region = deriveRegion(raw);
    } else {
      row.q24_region = null;
    }
  }
  row.q25_ethnicity = get("q25_ethnicity");
  row.q26_career_stage = get("q26_career_stage");

  // q27 boolean
  {
    const raw = get("q27_under_35");
    if (raw != null) {
      const { value, error } = parseBoolean(raw);
      if (error) malformed.push({ field: "q27_under_35", value: raw, reason: error });
      else row.q27_under_35 = value;
    }
  }
  row.q28_gender = get("q28_gender");

  // q2, q3 multi
  {
    const raw = get("q2_ticket_status");
    if (raw) {
      const parts = splitMulti(raw);
      const { known, unknown } = partitionKnown(parts, KNOWN_Q2);
      row.q2_ticket_status = known.length ? known : parts;
      if (unknown.length) {
        row.q2_other = unknown.join("; ");
        for (const u of unknown) unmapped.push({ field: "q2_ticket_status", value: u });
      }
    }
  }
  {
    const raw = get("q3_availability");
    if (raw) {
      const parts = splitMulti(raw);
      const { known, unknown } = partitionKnown(parts, KNOWN_Q3);
      row.q3_availability = known.length ? known : parts;
      if (unknown.length) {
        row.q3_other = unknown.join("; ");
        for (const u of unknown) unmapped.push({ field: "q3_availability", value: u });
      }
    }
  }

  return { row, unmapped, malformed };
}
