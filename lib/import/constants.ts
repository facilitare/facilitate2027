export type FieldKey =
  | "submitted_at"
  | "q1_email"
  | "q2_ticket_status"
  | "q3_availability"
  | "q4_session_provides"
  | "q5_audience"
  | "q6_audience_detail"
  | "q7_about_session"
  | "q7b_benefits"
  | "q8_group_setup"
  | "q9_room_layout"
  | "q9b_furniture"
  | "q10_delivery_mode"
  | "q11_theme"
  | "q12_timekeeping"
  | "q13_participation_level"
  | "q14_methods"
  | "q15_first_ten_minutes"
  | "q16_pathway"
  | "q17_iaf_member"
  | "q18_iaf_qualification"
  | "q19_large_groups_english"
  | "q20_full_name"
  | "q21_bio"
  | "q22_headshot_url"
  | "q23_cofacilitators"
  | "q24_region"
  | "q25_ethnicity"
  | "q26_career_stage"
  | "q27_under_35"
  | "q28_gender";

export interface FieldDef {
  field: FieldKey;
  aliases: string[]; // lowercased trimmed
  type: "text" | "text[]" | "enum" | "int" | "boolean" | "timestamptz";
}

export const FIELD_DEFS: FieldDef[] = [
  { field: "submitted_at", aliases: ["timestamp"], type: "timestamptz" },
  { field: "q1_email", aliases: ["username"], type: "text" },
  { field: "q2_ticket_status", aliases: ["before submitting this application", "before submitting"], type: "text[]" },
  { field: "q3_availability", aliases: ["the conference runs from friday"], type: "text[]" },
  { field: "q4_session_provides", aliases: ["will this session provide", "what facilitation skills and expertise", "facilitation skills and expertise will be the focus"], type: "text[]" },
  { field: "q5_audience", aliases: ["who will find your session of most value", "who is this session most suitable for"], type: "text[]" },
  { field: "q6_audience_detail", aliases: ["briefly describe in more detailed who would most benefit", "briefly describe in more detailed"], type: "text" },
  { field: "q7_about_session", aliases: ["outline what your proposed session is about"], type: "text" },
  { field: "q7b_benefits", aliases: ["session benefits"], type: "text" },
  { field: "q8_group_setup", aliases: ["imagining your planned session, what would be your ideal set up", "imagining your planned session", "ideal set up"], type: "text[]" },
  { field: "q9_room_layout", aliases: ["tell us about the room layout"], type: "text" },
  { field: "q9b_furniture", aliases: ["what do you need in terms of tables and chairs", "tables and chairs"], type: "text" },
  { field: "q10_delivery_mode", aliases: ["are you planning to deliver this session solo", "are you planning to facilitate alone"], type: "enum" },
  { field: "q11_theme", aliases: ["which theme do you feel your session is most aligned to", "which of the conference themes"], type: "enum" },
  { field: "q12_timekeeping", aliases: ["what do you normally do to keep your workshops", "what do you do normally to ensure that you keep to allocated time", "what do you normally do to keep"], type: "text" },
  { field: "q13_participation_level", aliases: ["amount of participation in my session", "amount of participation"], type: "int" },
  { field: "q14_methods", aliases: ["what methods are you likely to consider using", "please select the methods you may use"], type: "text[]" },
  { field: "q15_first_ten_minutes", aliases: ["give an example of something you do in the first 1-10 mins", "first 10 minutes of a session", "first 1-10 mins"], type: "text" },
  { field: "q16_pathway", aliases: ["tell us briefly about your facilitation journey", "tell us briefly about your facilitation pathway"], type: "text" },
  { field: "q17_iaf_member", aliases: ["are you a member of iaf"], type: "enum" },
  { field: "q18_iaf_qualification", aliases: ["which of these iaf qualifications do you have", "which (if any) of these iaf accreditations do you have", "iaf accreditations"], type: "text" },
  { field: "q19_large_groups_english", aliases: ["many conference participants will not speak english as their first language", "tell us about your experiences facilitating large group"], type: "text" },
  { field: "q20_full_name", aliases: ["what is your full name"], type: "text" },
  { field: "q21_bio", aliases: ["give a brief description of yourself"], type: "text" },
  { field: "q22_headshot_url", aliases: ["add a head shot"], type: "text" },
  { field: "q23_cofacilitators", aliases: ["if you have co-facilitators", "names of any co-facilitators"], type: "text" },
  { field: "q24_region", aliases: ["please tell us which country you based in currently", "which country you based in"], type: "text" },
  { field: "q25_ethnicity", aliases: ["how would you describe your ethnicity", "how would you describe your racial and ethnic background"], type: "text" },
  { field: "q26_career_stage", aliases: ["where would you describe yourself in terms of your career stage"], type: "text" },
  { field: "q27_under_35", aliases: ["are you under 35"], type: "boolean" },
  { field: "q28_gender", aliases: ["what gender do you identify with"], type: "text" },
];

// Known multi-select option sets (lowercase normalized for matching)
export const KNOWN_Q4 = [
  "highlighting a new or under used faciliation skill or technique",
  "give a facilitated experience of an approach",
  "reflection on an important element of facilitation practice",
  "provide practice in using a skill or technique",
  "strengthen facilitation practice",
  "facilitation specific skills",
].map((s) => s.toLowerCase());

export const KNOWN_Q5 = [
  "experienced facilitators",
  "new facilitators",
  "anyone who wears cardigans",
  "aliens",
  "cats",
].map((s) => s.toLowerCase());

export const KNOWN_Q8 = [
  "20 people in a circle",
  "40 people in small group tables",
  "between 30 to 50",
  "more than 50",
  "other:",
  "i am very flexible, this session will work with any group size and room set up",
  "50 people around 8-10 tables",
  "30-40 in a circle",
  "30-40 around tables",
  "up to 50",
  "above 50",
  "fully flexible",
  "needs to be under 30",
].map((s) => s.toLowerCase());

export const KNOWN_Q14 = [
  "reflective pauses - when participants work on their own for short periods",
  "pairs discussion",
  "card sort type activities",
  "creative materials eg building something or creating a collage",
  "post it notes for brainstorming and clustering",
  "physical movement",
  "drama",
  "case study",
  "small group discussion",
  "singing and playing the kazoo",
].map((s) => s.toLowerCase());

export const KNOWN_Q2 = [
  "i have already paid and registered for the conference",
  "if selected i know i must order a ticket for the conference and will do this if my session is confirmed",
  "if i have a co-facilitator they also will need to register to attend the conference",
].map((s) => s.toLowerCase());

export const KNOWN_Q3 = [
  "friday x april from 9.30 to 16.30",
  "saturday x april from 9.30 to 16.30",
  "friday 9  april from 9.30 to 16.30",
  "saturday 10 april from 9.00 to 16.30",
].map((s) => s.toLowerCase());

export function normalizeEnumValue(v: string): string {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export const ENUM_MAPS: Record<string, Record<string, string>> = {
  q10_delivery_mode: {
    solo: "solo",
    alone: "solo",
    on_my_own: "solo",
    with_a_co_facilitator: "one_cofacilitator",
    with_a_cofacilitator: "one_cofacilitator",
    one_cofacilitator: "one_cofacilitator",
    one_co_facilitator: "one_cofacilitator",
    two_or_more_cofacilitators: "two_or_more_cofacilitators",
    two_or_more: "two_or_more_cofacilitators",
  },
  q11_theme: {
    craft: "craft",
    clarity: "clarity",
    change: "change",
    challenge: "challenge",
  },
  q17_iaf_member: {
    yes: "yes",
    no: "no",
    not_sure: "not_sure",
    notsure: "not_sure",
  },
};

export const ALLOWED_ENUMS: Record<string, Set<string>> = {
  q10_delivery_mode: new Set(["solo", "one_cofacilitator", "two_or_more_cofacilitators"]),
  q11_theme: new Set(["craft", "clarity", "change", "challenge"]),
  q17_iaf_member: new Set(["yes", "no", "not_sure"]),
};

export function deriveRegion(countryRaw: string): string {
  const s = (countryRaw || "").toLowerCase().trim();
  if (!s) return "rest_of_world";
  if (s.includes("england") || s.includes("wales")) return "england_wales";
  if (s.includes("scotland") || s.includes("ireland")) return "scotland_ireland";
  // Europe heuristic: list of common europe countries
  const europeKeywords = ["germany", "france", "netherlands", "italy", "spain", "portugal", "belgium", "sweden", "norway", "denmark", "poland", "austria", "switzerland", "europe"];
  for (const kw of europeKeywords) if (s.includes(kw)) return "europe";
  const middleEastKeywords = ["middle east", "middle_east", "israel", "turkey", "uae", "qatar", "saudi", "jordan", "lebanon", "egypt"];
  for (const kw of middleEastKeywords) if (s.includes(kw)) return "middle_east";
  if (s.includes("somewhere nice")) return "rest_of_world";
  // default: try to guess - if string is a known country not in lists, treat as rest_of_world or europe? Use rest_of_world
  return "rest_of_world";
}
