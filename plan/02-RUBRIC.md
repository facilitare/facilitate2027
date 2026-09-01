# Scoring Rubric — verbatim strings

Every string in this file is a **UI string**. Copy it exactly into
`lib/rubric.ts`. Do not paraphrase, do not "improve" the wording, do not change
capitalisation. Assessors calibrate against this text; changing a word changes scores.

All four criteria use the same scale: **0 = below standard, 1 = meets standard,
2 = above standard.**

---

## 1. Machine-readable definition

```ts
// lib/rubric.ts
export const SCALE = [0, 1, 2] as const;
export type ScoreValue = (typeof SCALE)[number];

export const SCALE_LABELS: Record<ScoreValue, string> = {
  0: "Below standard",
  1: "Meets standard",
  2: "Above standard",
};

export type CriterionKey =
  | "focus"
  | "content"
  | "interactivity"
  | "credibility";

export const CRITERIA = [
  {
    key: "focus",
    order: 1,
    title: "Facilitation Focus",
    question: "How relevant is the session to facilitation?",
    sourceQuestions: ["q4_session_provides", "q5_audience", "q6_audience_detail", "q11_theme"],
    isGate: true,
    anchors: {
      0: "Session is oriented towards training, coaching, or a topic outside facilitation. Any overlap with facilitation is incidental.",
      1: "Session is oriented towards facilitation skills, practice or experience.",
      2: "Session clearly develops facilitation-specific skills and expertise, or develops personal facilitation practice or business.",
    },
  },
  {
    key: "content",
    order: 2,
    title: "Session Content",
    question:
      "Is the content of the session clearly explained, appropriate for the time available, and with clear benefits for participants?",
    sourceQuestions: ["q7_about_session", "q12_timekeeping", "q8_group_setup", "q9_room_layout"],
    isGate: false,
    anchors: {
      0: "It is unclear what the session would cover, how it might benefit participants, or the timing has not been fully considered.",
      1: "It is clear what the session would cover and what the benefits are, and there is recognition of the time limitation.",
      2: "The session content is well explained with clear benefits to participants. The content could easily be achieved within the allocated time.",
    },
  },
  {
    key: "interactivity",
    order: 3,
    title: "Interactivity",
    question:
      "Are appropriate methods planned to engage participants throughout, and has the session host considered how they would limit their own role?",
    sourceQuestions: ["q13_participation_level", "q14_methods", "q15_first_ten_minutes", "q10_delivery_mode"],
    isGate: false,
    anchors: {
      0: "Limited ideas for participation, with a focus on the session host presenting and sharing expertise.",
      1: "Plans have been made for participation throughout the session, and there is recognition of the host's role as a supporter of the learning experience.",
      2: "Varied methods for participation are proposed, with a clear statement of intent from the session host to support the learning experience rather than dominate it.",
    },
  },
  {
    key: "credibility",
    order: 4,
    title: "Credibility and Experience",
    question:
      "Does the session host have relevant facilitation experience of working with large groups, and with groups where English is not the primary language?",
    sourceQuestions: ["q16_pathway", "q19_large_groups_english"],
    isGate: false,
    anchors: {
      0: "Limited experience of working with either large groups or groups where English is not the primary language.",
      1: "Has experience of working with large groups and with groups where English is not the primary language.",
      2: "Has many examples and experiences of working with large groups and with groups where English is not the primary language, across a range of settings.",
    },
  },
] as const;

export const MAX_PRIMARY_SCORE = 8; // 4 criteria × 2
```

---

## 2. IAF standing (derived, never scored by a human)

Computed at import time from Q17 and Q18. Stored on the application row as
`iaf_standing` (integer 0–2). Displayed to leads only, in round 2. **Not shown on the
assessor's scoring screen** — it is not part of the anonymous judgement.

```ts
// lib/rubric.ts
export function deriveIafStanding(
  q17: "yes" | "no" | "not_sure",
  q18:
    | "endorsed_facilitator"
    | "certified_professional_facilitator"
    | "certified_professional_facilitator_master"
    | "other_qualifications"
    | "no_relevant_qualifications",
): 0 | 1 | 2 {
  if (q17 !== "yes") return 0;
  const accredited =
    q18 === "endorsed_facilitator" ||
    q18 === "certified_professional_facilitator" ||
    q18 === "certified_professional_facilitator_master";
  return accredited ? 2 : 1;
}
```

Labels for display:

| Value | Label |
|---|---|
| 0 | Not an IAF member |
| 1 | IAF member |
| 2 | IAF member with IAF accreditation |

**Default use: additive** (setting `iaf_bonus_mode = 'additive'`), agreed by the selection
team on 2026-08-19: IAF standing is a scored column alongside the four criteria, making the
displayed total 0–10. The `tiebreak` mode remains available in settings.

**In either mode, the quality standard in §5 is computed on the four criteria only (0–8).**
IAF membership can raise an application's rank; it can never lift it over the quality bar.
Every screen that shows a total must state which mode is active.

---

## 3. "No evidence provided"

Each criterion has a companion boolean, `<criterion>_no_evidence`.

- When ticked, the score is **forced to 0** and the score buttons are disabled.
- The flag is stored separately and surfaced in the aggregated applicant feedback as a
  distinct line, because "you did not address this" is different guidance from "what you
  wrote was weak".
- It never affects arithmetic. A no-evidence criterion contributes 0, exactly like a
  scored 0.

UI string for the checkbox: `No evidence provided in the application`

---

## 4. Feedback fields

Both are **required** before an assessment can be submitted. Minimum 20 characters each.
These are the strings from the existing score sheet, kept unchanged so the panel
recognises them.

| Field | Label | Placeholder |
|---|---|---|
| `feedback_liked` | Feedback to applicant — what you liked | What worked in this proposal? Be specific enough that the applicant can repeat it. |
| `feedback_improve` | Feedback to applicant — what could make this a stronger session proposal | What single change would most improve this proposal? |

A third field, `private_note`, is optional, visible to the panel only, and never
included in applicant-facing exports. Label: `Private note (panel only — never sent to the applicant)`.

---

## 5. Quality standard (configurable, defaults below)

```ts
// lib/rubric.ts
export const QUALITY_DEFAULTS = {
  minMeanTotal: 5.0,      // out of 8
  minMeanPerCriterion: 1.0,
  gateCriterion: "focus" as CriterionKey,
  gateMinimum: 1.0,
};
```

Computed on the **primary score (0–8) only** — the IAF bonus is excluded regardless of
`iaf_bonus_mode`.

An application is `below_standard` when **any** of these holds:

1. mean total < `minMeanTotal`;
2. any criterion mean < `minMeanPerCriterion`;
3. mean of the gate criterion (`focus`) < `gateMinimum`.

Rule 3 cannot be compensated by high scores elsewhere. A lead may override the result,
but the override requires a written reason and is recorded in `audit_log`.

---

## 6. Divergence

For each criterion on each application, compute `max(scores) - min(scores)` across
submitted assessments.

- **≥ 2** on any criterion → application is flagged `needs_calibration` and appears in
  the lead's "Disagreements" view.
- **= 2 on the gate criterion (focus)** → flagged `high_divergence`, shown first, because
  the panel disagrees on whether the session even belongs at the conference.

Divergence never changes a score automatically. It only surfaces conversations.
