import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "fs";
import Papa from "papaparse";
import { getSql } from "../lib/db/client";

function splitMulti(v: string | undefined): string[] | null {
  if (!v || !v.trim()) return null;
  const parts = v.split(/[,;]\s*|\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  // Google joins with ", " for multi-select — split on ", "
  if (parts.length === 1 && v.includes(", ")) return v.split(", ").map((s) => s.trim()).filter(Boolean);
  if (v.includes(";")) return v.split(";").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : null;
}

function mapTheme(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("craft")) return "craft";
  if (t.includes("clarity")) return "clarity";
  if (t.includes("change")) return "change";
  if (t.includes("challenge")) return "challenge";
  return "craft";
}

function mapDelivery(raw: string): string | null {
  if (!raw) return null;
  const t = raw.toLowerCase();
  if (t.includes("co-facilitator") || t.includes("co facilitator")) return "one_cofacilitator";
  if (t.includes("two or more")) return "two_or_more_cofacilitators";
  if (t.includes("alone") || t.trim() === "solo" || t.includes("on my own")) return "solo";
  if (t.includes("with a co")) return "one_cofacilitator";
  return "solo";
}

function countryToRegion(country: string): string {
  if (!country) return "rest_of_world";
  const c = country.toLowerCase();
  if (c.includes("england and wales") || c.includes("england")) return "england_wales";
  if (c.includes("scotland") || c.includes("ireland")) return "scotland_ireland";
  if (c.includes("somewhere nice")) return "rest_of_world";
  // default to europe for UK test data that is England&Wales already handled
  return "rest_of_world";
}

async function run() {
  const sql = getSql();
  const waveRows = await sql`select id, wave_number from waves where wave_number = 1`;
  if (!(waveRows as any[]).length) throw new Error("Wave 1 not found — run db:seed first");
  const waveId = (waveRows as any[])[0].id;

  const csvPath = "db/fixtures/sample-responses.csv";
  const csvText = readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data as any[];
  console.log(`CSV rows: ${rows.length}`);

  // existing ref codes to avoid collision
  const existing = await sql`select ref_code from applications where wave_id = ${waveId} order by ref_code`;
  const existingSet = new Set((existing as any[]).map((r) => r.ref_code));
  // synthetic occupy W1-001..012, so real fixtures start at 013
  let seq = 13;
  function nextRef(): string {
    let r: string;
    do {
      r = `W1-${String(seq).padStart(3, "0")}`;
      seq++;
    } while (existingSet.has(r));
    existingSet.add(r);
    return r;
  }

  for (const row of rows) {
    // find keys by prefix (header long)
    const find = (prefix: string) => Object.keys(row).find((k) => k.startsWith(prefix));
    const kTimestamp = find("Timestamp");
    const kUsername = find("Username");
    const kAvailability = find("The conference runs from Friday");
    const kOutline = find("Outline what your proposed session is about");
    const kBenefits = find("Session Benefits");
    const kTheme = find("Which of the conference themes");
    const kTimekeeping = find("What do you normally do to keep your workshops");
    const kFacilSkills = find("What facilitation skills and expertise will be the focus");
    const kWho = find("Who is this session most suitable for");
    const kSolo = find("Are you planning to facilitate alone");
    const kGroup = find("Imagining your planned session");
    const kLarge50 = find("Your Large Group Experiences");
    const kMethods = find("At the IAF Conference, we value participation");
    const kFirst10 = find("Building in Participation to a Workshop");
    const kPathway = find("Tell us briefly about your facilitation journey");
    const kIafMember = find("Are you a member of IAF");
    const kIafQual = find("We are keen to support those members");
    const kLargeEng = find("Many conference participants will not speak English");
    const kFullName = find("What is your full name");
    const kCoFacil = find("Names of any co-facilitators");
    const kCountry = find("Please tell us which country you based in currently");
    const kEthnicity = find("How would you describe your ethnicity");
    const kCareer = find("Where would you describe yourself in terms of your career stage");
    const kUnder35 = find("Are you under 35");
    const kGender = find("What gender do you identify with");
    const kTicket = find("Before submitting this application please confirm");

    const email = row[kUsername!]?.trim() || null;
    if (!email) continue;
    // dedupe by email in same wave
    const dup = await sql`select id from applications where wave_id = ${waveId} and q1_email = ${email}`;
    if ((dup as any[]).length) {
      console.log(`skip duplicate ${email}`);
      continue;
    }

    const ref = nextRef();
    const theme = mapTheme(row[kTheme!] || "");
    const delivery = mapDelivery(row[kSolo!] || "");
    const country = row[kCountry!]?.trim() || "";
    const region = countryToRegion(country); // stored in q24_region text
    const iafMemberRaw = (row[kIafMember!] || "").toLowerCase();
    const q17 = iafMemberRaw.includes("yes") ? "yes" : iafMemberRaw.includes("not sure") ? "not_sure" : iafMemberRaw.includes("no") ? "no" : "not_sure";
    const q18raw = (row[kIafQual!] || "").toLowerCase();
    let q18 = "no_relevant_qualifications";
    if (q18raw.includes("endorsed")) q18 = "endorsed_facilitator";
    else if (q18raw.includes("master")) q18 = "certified_professional_facilitator_master";
    else if (q18raw.includes("certified") || q18raw.includes("cpf")) q18 = "certified_professional_facilitator";
    else if (q18raw.includes("other qualifications")) q18 = "other_qualifications";

    const iafStanding = q17 !== "yes" ? 0 : q18 === "endorsed_facilitator" || q18 === "certified_professional_facilitator" || q18 === "certified_professional_facilitator_master" ? 2 : 1;

    const under35raw = (row[kUnder35!] || "").toLowerCase().trim();
    const under35 = under35raw === "yes" ? true : under35raw === "no" ? false : null;

    // anonymity scan (simple)
    const q7 = row[kOutline!]?.trim() || null;
    const q7b = row[kBenefits!]?.trim() || null;
    const q16 = row[kPathway!]?.trim() || null;
    const q19eng = row[kLargeEng!]?.trim() || null;
    const fullName = row[kFullName!]?.trim() || null;
    let anonFlag = false, anonNotes: string[] = [];
    if (fullName && q7 && q7.toLowerCase().includes(fullName.split(" ")[0].toLowerCase())) { anonFlag = true; anonNotes.push(`q7: contains applicant first name`); }
    if (fullName && q16 && q16.toLowerCase().includes(fullName.split(" ")[0].toLowerCase())) { anonFlag = true; anonNotes.push(`q16: contains applicant first name`); }

    const submittedAt = kTimestamp && row[kTimestamp] ? new Date(row[kTimestamp]) : new Date();
    if (isNaN(submittedAt.getTime())) console.log(`warn: invalid timestamp ${row[kTimestamp!]}`);

    await sql`
      insert into applications (
        wave_id, ref_code, status, submitted_at,
        q1_email, q2_ticket_status, q3_availability,
        q4_session_provides, q5_audience, q6_audience_detail,
        q7_about_session, q7b_benefits, q8_group_setup, q9_room_layout, q10_delivery_mode, q11_theme, q12_timekeeping,
        q13_participation_level, q14_methods, q15_first_ten_minutes, q16_pathway, q17_iaf_member, q18_iaf_qualification, q19_large_groups_english,
        q20_full_name, q21_bio, q23_cofacilitators, q24_region, q25_ethnicity, q26_career_stage, q27_under_35, q28_gender,
        iaf_standing, anonymity_flag, anonymity_notes
      ) values (
        ${waveId}, ${ref}, 'imported', ${submittedAt.toISOString()},
        ${email}, ${splitMulti(row[kTicket!])}, ${splitMulti(row[kAvailability!])},
        ${splitMulti(row[kFacilSkills!])}, ${splitMulti(row[kWho!])}, ${null},
        ${q7}, ${q7b}, ${splitMulti(row[kGroup!])}, ${null}, ${delivery}, ${theme}, ${row[kTimekeeping!]?.trim() || null},
        ${null}, ${splitMulti(row[kMethods!])}, ${row[kFirst10!]?.trim() || null}, ${q16}, ${q17}, ${q18}, ${q19eng},
        ${fullName}, ${null}, ${row[kCoFacil!]?.trim() || null}, ${country || region}, ${row[kEthnicity!]?.trim() || null}, ${row[kCareer!]?.trim() || null}, ${under35}, ${row[kGender!]?.trim() || null},
        ${iafStanding}, ${anonFlag}, ${anonNotes.length ? anonNotes.join("; ") : null}
      )
    `;
    console.log(`imported ${ref} ${email} theme=${theme} anon=${anonFlag}`);
  }

  const cnt = await sql`select count(*)::int as c from applications where wave_id = ${waveId}`;
  console.log("total applications now", (cnt as any[])[0].c);
  const rows2 = await sql`select ref_code, q20_full_name, q1_email, q11_theme, anonymity_flag from applications where wave_id = ${waveId} order by ref_code`;
  console.table(rows2 as any[]);
}

run().catch((e) => { console.error(e); process.exit(1); });
