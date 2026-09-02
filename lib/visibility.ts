/**
 * Field visibility allow-lists — rule R1 (anonymity enforced on the server).
 * A new column added to `applications` must be invisible by default.
 * ROUND1_FIELDS are the only columns an assessor may see in round 1.
 * IDENTITY_FIELDS are the round-2 identity columns — never served in round 1.
 * Implemented as allow-lists, not deny-lists.
 */

export const ROUND1_FIELDS = [
  "id",
  "ref_code",
  "wave_id",
  "q11_theme",
  "q4_session_provides",
  "q4_session_provides_other",
  "q5_audience",
  "q5_audience_other",
  "q6_audience_detail",
  "q7_about_session",
  "q7b_benefits",
  "q8_group_setup",
  "q8_group_setup_other",
  "q9_room_layout",
  "q10_delivery_mode",
  "q12_timekeeping",
  "q13_participation_level",
  "q14_methods",
  "q14_methods_other",
  "q15_first_ten_minutes",
  "q16_pathway",
  "q17_iaf_member",
  "q18_iaf_qualification",
  "q19_large_groups_english",
] as const;

export const IDENTITY_FIELDS = [
  "q1_email",
  "q2_ticket_status",
  "q3_availability",
  "q20_full_name",
  "q21_bio",
  "q22_headshot_url",
  "q23_cofacilitators",
  "q24_region",
  "q25_ethnicity",
  "q26_career_stage",
  "q27_under_35",
  "q28_gender",
] as const;

export type Round1Field = (typeof ROUND1_FIELDS)[number];
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

/**
 * Explicit column list for SQL — do not use star select on an assessor-facing path.
 * Used by GET /api/applications/:id/round1 and any other round-1 reader.
 * Includes the redacted columns needed for substitution (not exposed to client).
 */
export const ROUND1_SELECT_COLUMNS = ROUND1_FIELDS.join(", ");

/** Columns needed to perform redaction substitution server-side (not returned). */
export const REDACTED_COLUMNS = [
  "redacted_q7",
  "redacted_q7b",
  "redacted_q16",
  "redacted_q19",
] as const;
