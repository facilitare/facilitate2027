import type { CriterionKey } from "./rubric";

/**
 * Assessor view of the application, in the same order and numbering as the
 * Google Form (v2, Oct 2026 — plan/11-FORM-2027-V2.md), so an assessor holding a
 * blank copy of the form can see where each answer came from.
 * Each form section ends with the criterion it provides evidence for.
 */

export type AnswerKind = "prose" | "list" | "theme" | "title" | "delivery" | "iaf";

export type FormQuestion = {
  num: string;
  label: string;
  help?: string;
  field: string;
  otherField?: string;
  kind: AnswerKind;
};

export type FormSection = {
  num: number;
  title: string;
  intro: string;
  criterion: CriterionKey;
  questions: FormQuestion[];
};

export const FORM_SECTIONS: FormSection[] = [
  {
    num: 2,
    title: "All About Your Planned Session",
    intro:
      "Applicants were asked what the session is about and the benefits/outcomes for the intended participants. Sessions are 60 minutes, leaving roughly 50 minutes for content after introductions and wrap-up; punctuality is essential.",
    criterion: "content",
    questions: [
      { num: "2.1", label: "Working title", field: "session_title", kind: "title" },
      { num: "2.2", label: "What is your session about?", help: "Outline of the proposed session (approx. 150 words / 999 characters).", field: "q7_about_session", kind: "prose" },
      { num: "2.3", label: "What are the benefits for participants?", help: "What will facilitators learn? What might they use in their own practice? (approx. 150 words)", field: "q7b_benefits", kind: "prose" },
      { num: "2.4", label: "Conference theme (choose one)", help: "Craft — foundations: core skills, ethics, inclusion, essential tools · Clarity — proving impact and value of facilitation · Change — future trends, AI, hybrid, new methods · Challenge — disagreement, uncertainty, difficult conversations, inclusion and justice.", field: "q11_theme", kind: "theme" },
      { num: "2.5", label: "Why is the session aligned to this theme?", field: "theme_reason", kind: "prose" },
      { num: "2.6", label: "How do you keep your sessions on schedule?", help: "Examples of timekeeping tools and techniques from their practice.", field: "q12_timekeeping", kind: "prose" },
    ],
  },
  {
    num: 3,
    title: "Facilitation Focus",
    intro:
      "Every session should be for facilitators and about facilitation. Training or coaching topics can be learned at other events. Applicants were asked how their session will focus on facilitation skills and practice.",
    criterion: "focus",
    questions: [
      { num: "3.1", label: "Facilitation skills and expertise in focus (options ticked)", field: "q4_session_provides", otherField: "q4_session_provides_other", kind: "list" },
      { num: "3.2", label: "Who is this session most suitable for?", help: "Who will benefit most and why (e.g. new facilitators, internal facilitators, independents, business owners).", field: "q6_audience_detail", kind: "prose" },
      { num: "3.3", label: "Solo or with others?", field: "q10_delivery_mode", otherField: "q10_delivery_other", kind: "delivery" },
      { num: "3.4", label: "Reason for solo or co-facilitation", help: "No correct answer — applicants reflect on how the session will work on the day.", field: "cofacil_reason", kind: "prose" },
    ],
  },
  {
    num: 4,
    title: "Creating Interactive Experiences",
    intro:
      "The conference prioritises high interaction over heavy presentations or product pitches. Sessions should actively engage large groups (typically up to 50 per room) with methods that go beyond basic slides or simple discussion.",
    criterion: "interactivity",
    questions: [
      { num: "4.1", label: "Ideal room setup (options ticked)", field: "q8_group_setup", otherField: "q8_group_setup_other", kind: "list" },
      { num: "4.2", label: "Large group experience", help: "An example of facilitating 50+ participants: what was most challenging and how they adapted (250 words).", field: "large_group_experience", kind: "prose" },
      { num: "4.3", label: "Methods to support participation (options ticked)", field: "q14_methods", otherField: "q14_methods_other", kind: "list" },
      { num: "4.4", label: "One technique in the first 10 minutes", help: "How they encourage early participation and set the tone.", field: "q15_first_ten_minutes", kind: "prose" },
    ],
  },
  {
    num: 5,
    title: "Professional Qualifications and Experience",
    intro:
      "Hosts may bring experience from IAF qualifications, hands-on work or complex group dynamics. Years in the role matter less than the ability to lead large groups effectively and inclusively.",
    criterion: "credibility",
    questions: [
      { num: "5.1", label: "Facilitation journey", help: "When they started and their most significant learning experiences.", field: "q16_pathway", kind: "prose" },
      { num: "5.2", label: "Facilitating non-native English speakers", help: "Their experience and how they adapt to ensure inclusive participation.", field: "q19_large_groups_english", kind: "prose" },
      { num: "5.3", label: "Designing for diverse needs", help: "What they typically do so everyone feels welcomed and included, without knowing in advance who will attend.", field: "inclusive_design", kind: "prose" },
      { num: "5.4–5.5", label: "IAF membership and accreditation", field: "q17_iaf_member", otherField: "q18_iaf_qualification", kind: "iaf" },
    ],
  },
];

export const DELIVERY_LABELS: Record<string, string> = {
  solo: "Solo",
  one_cofacilitator: "With one co-facilitator",
  two_or_more_cofacilitators: "With 2–3 co-facilitators",
};
