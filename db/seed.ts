import { getSql } from "../lib/db/client";
import { config } from "dotenv";
config({ path: ".env.local" });

const EVALUATORS = [
  { name: "Ingrid Halvorsen", email: "ingrid@example.org", role: "lead" as const },
  { name: "Marco Ferretti", email: "marco@example.org", role: "assessor" as const },
  { name: "Amina Yusuf", email: "amina@example.org", role: "assessor" as const },
  { name: "Tomás Ribeiro", email: "tomas@example.org", role: "assessor" as const },
  { name: "Katja Novak", email: "katja@example.org", role: "assessor" as const },
  { name: "Daniel Brennan", email: "daniel@example.org", role: "assessor" as const },
];

const THEMES = ["craft", "clarity", "change", "challenge"] as const;
const REGIONS = ["england_wales", "scotland_ireland", "europe", "middle_east", "rest_of_world"] as const;

function deriveIaf(q17: string, q18: string): number {
  if (q17 !== "yes") return 0;
  const acc = q18 === "endorsed_facilitator" || q18 === "certified_professional_facilitator" || q18 === "certified_professional_facilitator_master";
  return acc ? 2 : 1;
}

async function seed() {
  const sql = getSql();

  // evaluators — upsert by email
  for (const e of EVALUATORS) {
    await sql`insert into evaluators (name, email, role) values (${e.name}, ${e.email}, ${e.role}) on conflict (email) do update set name = excluded.name, role = excluded.role, active = true`;
  }
  console.log("evaluators seeded");

  // wave
  const waveRows = await sql`select id from waves where wave_number = 1`;
  let waveId: string;
  if ((waveRows as any[]).length === 0) {
    const r = await sql`insert into waves (name, wave_number, slots_target, status) values ('Wave One: Core Programme', 1, 24, 'draft') returning id`;
    waveId = (r as any[])[0].id;
    console.log("wave created", waveId);
  } else {
    waveId = (waveRows as any[])[0].id;
    console.log("wave exists", waveId);
  }

  // check if synthetic already seeded (12 synthetic + later real imports)
  const existing = await sql`select count(*)::int as c from applications where wave_id = ${waveId} and ref_code like 'W1-%'`;
  const count = (existing as any[])[0].c;
  if (count >= 12) {
    console.log(`applications already seeded (${count}), skipping synthetic`);
    return;
  }

  const synthetics = [
    {
      ref: "W1-001",
      theme: "craft",
      q7: "We will run one real decision through two rounds. In the first, an AI assistant clusters points and offers a recommendation. In the second, the same group works without it. Participants swap roles so everyone is once inside the group and once observing.",
      q7b: "Clear benefits: facilitators learn when to slow the group and protect disagreement that a clean AI synthesis erases.",
      q12: "I design in blocks with a visible clock and rehearse the close.",
      q16: "Started facilitating inside [organisation redacted] in 2014, independent since 2018, strategy and conflict work 40-120 participants.",
      q19: "Most work with mixed-language groups across three countries. I write every instruction on a slide before I say it aloud.",
      region: "europe",
      participation: 4,
      weak: false,
    },
    {
      ref: "W1-002",
      theme: "clarity",
      q7: "How to price facilitation without apologising. We map value, cost and proof through three client conversations, using your own recent proposal as material.",
      q7b: "Participants leave with a one-page offer and a pricing rationale they can defend.",
      q12: "Timebox, parking lot, and a 2-minute warning before each transition.",
      q16: "10 years in-house facilitation for a financial services group, 30-60 people.",
      q19: "Use visuals, slow pace, check comprehension by asking someone to restate the task.",
      region: "england_wales",
      participation: 3,
      weak: false,
    },
    {
      ref: "W1-003",
      theme: "change",
      q7: "AI is already in the room — summarising, clustering, proposing. What does the facilitator do differently when the machine is faster at synthesis than the group?",
      q7b: "We name the moves only a human can make: holding tension, refusing premature closure.",
      q12: "Built-in buffers; cut debrief, not reflection.",
      q16: "Freelance since 2016, futures and tech teams, 50-100 participants.",
      q19: "Silent writing time lets people compose in a second language without competing for the floor.",
      region: "middle_east",
      participation: 5,
      weak: false,
    },
    {
      ref: "W1-004",
      theme: "challenge",
      q7: "The most important sessions are rarely the easiest. We practice staying steady through disagreement, using a live case of a team that cannot agree on priorities.",
      q7b: "Tools for contracting, naming dynamics, and self-regulation under pressure.",
      q12: "Contract time at the start and keep it visible.",
      q16: "Community facilitation, conflict and peacebuilding, 20-80 participants.",
      q19: "Pair work before plenary, translated handouts, no jargon.",
      region: "scotland_ireland",
      participation: 4,
      weak: false,
    },
    {
      ref: "W1-005",
      theme: "craft",
      q7: "Unclear session about general teamwork without facilitation focus. We will talk about leadership and coaching.",
      q7b: "Benefits are vague and not tied to facilitation practice.",
      q12: "I try to keep time but often overrun.",
      q16: "I have run a few workshops internally, mostly training.",
      q19: "Limited experience with large groups or non-English groups.",
      region: "england_wales",
      participation: 2,
      weak: true,
      offTopic: true,
    },
    {
      ref: "W1-006",
      theme: "clarity",
      q7: "Short description. We will cover many topics quickly: contracting, design, delivery, evaluation, business development.",
      q7b: "Many benefits listed but timing not considered for 50 minutes.",
      q12: "Hope to finish on time.",
      q16: "Early career, 2 years, small groups 10-20.",
      q19: "No large-group non-English experience yet.",
      region: "europe",
      participation: 2,
      weak: true,
    },
    {
      ref: "W1-007",
      theme: "change",
      q7: "My company Acme Consulting will showcase our proprietary framework. I, John Smith, will present our client cases from London.",
      q7b: "Learn about our framework directly from its creator.",
      q12: "Strict agenda.",
      q16: "Senior consultant at Acme Consulting, London, 10 years.",
      q19: "We work in English only in London.",
      region: "england_wales",
      participation: 1,
      leak: true,
      leakerName: "John Smith",
    },
    {
      ref: "W1-008",
      theme: "challenge",
      q7: "We explore how Ingrid Halvorsen's team handles high-stakes conflict. I learned this at my company in Oslo.",
      q7b: "Direct learning from Ingrid's approach.",
      q12: "Time management via co-facilitator.",
      q16: "I worked with Ingrid Halvorsen in 2022 on a 60-person strategy session.",
      q19: "Facilitated in Norway with 40 participants, English as second language.",
      region: "rest_of_world",
      participation: 3,
      leak: true,
      leakerName: "Ingrid Halvorsen",
    },
    {
      ref: "W1-009",
      theme: "craft",
      q7: "Deep dive into diamond of participation and related tools, with live practice and peer feedback.",
      q7b: "Participants refine one tool they already use.",
      q12: "Rehearsed close, visible clock.",
      q16: "IAF Certified Professional Facilitator, 15 years, 20-120 participants.",
      q19: "Routinely facilitate 60-90 people with simultaneous translation needs.",
      region: "europe",
      participation: 5,
      weak: false,
    },
    {
      ref: "W1-010",
      theme: "clarity",
      q7: "From session to business: building a facilitation practice that sustains you. Pricing, positioning, proof.",
      q7b: "A practical canvas for your next 90 days.",
      q12: "Modular blocks, each with its own timebox.",
      q16: "Independent since 2019, 40-70 participants, public sector.",
      q19: "Mixed-language groups in Brussels, 30-50 participants.",
      region: "middle_east",
      participation: 4,
      weak: false,
    },
    {
      ref: "W1-011",
      theme: "change",
      q7: "Hybrid facilitation: what changes when half the room is online? We test three formats and debrief what was lost and gained.",
      q7b: "Checklist for hybrid design you can reuse next week.",
      q12: "Co-facilitator owns time, I own process.",
      q16: "Hybrid since 2020, 30-200 participants, tech + public sector.",
      q19: "Large hybrid groups with English as lingua franca, learned to over-communicate instructions.",
      region: "england_wales",
      participation: 5,
      weak: false,
    },
    {
      ref: "W1-012",
      theme: "challenge",
      q7: "Holding space when the group wants to fight or flee. We work with a live disagreement, not a case study.",
      q7b: "You practice the one intervention you avoid most.",
      q12: "Contract, pause, and name the process.",
      q16: "10 years, Open Space and World Café, 50-150 participants.",
      q19: "Facilitated in three languages contexts, learned to write instructions before speaking them.",
      region: "scotland_ireland",
      participation: 4,
      weak: false,
    },
  ];

  for (const s of synthetics) {
    const exists = await sql`select id from applications where wave_id = ${waveId} and ref_code = ${s.ref}`;
    if ((exists as any[]).length) continue;
    const iaf = s.ref === "W1-009" ? 2 : s.ref === "W1-002" ? 1 : 0;
    const flag = !!(s as any).leak;
    const notes = (s as any).leak ? `q7: contains applicant name "${(s as any).leakerName}"` : null;
    await sql`
      insert into applications (
        wave_id, ref_code, status, submitted_at,
        q4_session_provides, q5_audience, q6_audience_detail,
        q7_about_session, q7b_benefits, q8_group_setup, q9_room_layout, q10_delivery_mode, q11_theme, q12_timekeeping,
        q13_participation_level, q14_methods, q15_first_ten_minutes, q16_pathway, q17_iaf_member, q18_iaf_qualification, q19_large_groups_english,
        q1_email, q20_full_name, q24_region, q25_ethnicity, q26_career_stage, q27_under_35, q28_gender,
        iaf_standing, anonymity_flag, anonymity_notes
      ) values (
        ${waveId}, ${s.ref}, 'imported', now(),
        ${["Facilitation specific skills"]}, ${["Experienced facilitators"]}, ${"Facilitators working with AI or complexity"},
        ${s.q7}, ${s.q7b}, ${["Between 30 to 50"]}, ${"Round tables of six"}, ${"solo"}, ${s.theme}, ${s.q12},
        ${s.participation}, ${["Small group discussion","Reflective pauses"]}, ${"Silent writing then share in pairs"}, ${s.q16}, ${iaf ? "yes" : "no"}, ${iaf === 2 ? "certified_professional_facilitator" : iaf === 1 ? "other_qualifications" : "no_relevant_qualifications"}, ${s.q19},
        ${"synthetic+" + s.ref + "@example.org"}, ${"Synthetic " + s.ref}, ${s.region}, ${""}, ${"Mid career"}, ${false}, ${"Prefer not to say"},
        ${iaf}, ${flag}, ${notes}
      )
    `;
    console.log(`seeded ${s.ref} flag=${flag}`);
  }

  const all = await sql`select count(*)::int as c from applications where wave_id = ${waveId}`;
  console.log("total applications", (all as any[])[0].c);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
