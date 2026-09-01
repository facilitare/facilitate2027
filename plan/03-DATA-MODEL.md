# Data Model

Postgres (Neon). Migrations are hand-written SQL files in `db/migrations/`, applied in
filename order by `npm run db:migrate`. Never edit an applied migration; add a new one.

---

## 1. Design notes for the implementer

- **The four criteria are denormalised into columns** on `assessments`, not rows in a
  child table. The criteria are fixed by policy and will not change during the
  conference cycle. Four columns are simpler to read, simpler to validate, and remove a
  whole class of "missing row" bugs. Do not normalise this.
- **Application content columns are named after the form question number** (`q7_...`).
  This keeps the CSV mapping obvious and reviewable against the printed form.
- All timestamps are `timestamptz`, all defaults `now()`.
- All ids are `uuid` with `gen_random_uuid()` (`pgcrypto` is available on Neon).

---

## 2. Schema

```sql
-- db/migrations/001_init.sql

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- evaluators
create table evaluators (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text unique,
  role        text not null default 'assessor'
              check (role in ('assessor', 'lead')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------------- waves
create table waves (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,               -- 'Wave One: Core Programme'
  wave_number   int  not null,
  slots_target  int,                         -- expected number of sessions to select
  opens_at      timestamptz,
  closes_at     timestamptz,
  status        text not null default 'draft'
                check (status in ('draft', 'scoring', 'panel', 'closed')),
  created_at    timestamptz not null default now()
);

-- -------------------------------------------------------------- applications
create table applications (
  id            uuid primary key default gen_random_uuid(),
  wave_id       uuid not null references waves(id) on delete restrict,
  ref_code      text not null,               -- 'W1-014', shown to assessors instead of a name
  submitted_at  timestamptz,
  imported_at   timestamptz not null default now(),
  import_batch  uuid,

  status        text not null default 'imported'
                check (status in (
                  'imported',       -- in the system, not yet released for scoring
                  'scoring',        -- assigned, assessors are working
                  'scored',         -- all assigned assessments submitted
                  'shortlisted',    -- passed to the panel
                  'accepted',
                  'declined',
                  'deferred',       -- roll forward to a later wave
                  'standby',        -- standby host pool
                  'withdrawn'
                )),

  -- ============ ROUND 1: CONTENT (anonymous, visible to assessors) ============
  q4_session_provides       text[],   -- multi-select
  q4_session_provides_other text,
  q5_audience               text[],   -- multi-select
  q5_audience_other         text,
  q6_audience_detail        text,
  q7_about_session          text,     -- ~999 chars. HIGH LEAK RISK (live: "Outline what your proposed session is about...")
  q7b_benefits              text,     -- live 18.08.2026: "Session Benefits" — split from Q7, added after plan 19.08
  q8_group_setup            text[],   -- multi-select, see §3.1 for live vs planned options
  q8_group_setup_other      text,
  q9_room_layout            text,     -- live: may be empty — merged into Q8 in some exports
  q9b_furniture             text,     -- added 19.08 plan, NOT in live form 18.08 — keep nullable for forward-compat
  q10_delivery_mode         text check (q10_delivery_mode in
                              ('solo','one_cofacilitator','two_or_more_cofacilitators')),
  q11_theme                 text check (q11_theme in ('craft','clarity','change','challenge')),
  q12_timekeeping           text,
  q13_participation_level   int check (q13_participation_level between 1 and 5),
  q14_methods               text[],   -- multi-select
  q14_methods_other         text,
  q15_first_ten_minutes     text,
  q16_pathway               text,     -- HIGH LEAK RISK
  q17_iaf_member            text check (q17_iaf_member in ('yes','no','not_sure')),
  q18_iaf_qualification     text,
  q19_large_groups_english  text,     -- HIGH LEAK RISK

  -- ============ ROUND 2: IDENTITY (leads only, never served in round 1) =======
  q1_email                  text,
  q2_ticket_status          text[],
  q3_availability           text[],
  q20_full_name             text,
  q21_bio                   text,
  q22_headshot_url          text,
  q23_cofacilitators        text,
  q24_region                text,     -- live 18.08.2026: "which country you based in" (free text, not enum) — derive region in import; keep text for now
  q25_ethnicity             text,     -- free text; live shows "What are the options we should be using here?" placeholder
  q26_career_stage          text,     -- live: Early / Mid / "Golden years" / Retired
  q27_under_35              boolean,  -- live header "Are you under 35?" (10% target)
  q28_gender                text,     -- live: Female/Male/Prefer not to say/Other

  -- ============ DERIVED / OPERATIONAL =======================================
  iaf_standing        int check (iaf_standing between 0 and 2),  -- see 02-RUBRIC §2

  -- anonymity handling
  anonymity_flag      boolean not null default false,
  anonymity_notes     text,
  redacted_q7         text,      -- when present, served instead of q7 in round 1
  redacted_q7b        text,      -- for q7b_benefits
  redacted_q16        text,
  redacted_q19        text,
  redacted_by         uuid references evaluators(id),
  redacted_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (wave_id, ref_code)
);

create index on applications (wave_id, status);
create index on applications (q11_theme);

-- --------------------------------------------------------------- assessments
-- One row per (application, evaluator). Created by the assignment engine in
-- state 'assigned'; the assessor fills it in and submits it.
create table assessments (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references applications(id) on delete cascade,
  evaluator_id    uuid not null references evaluators(id)  on delete restrict,

  state           text not null default 'assigned'
                  check (state in ('assigned','draft','submitted','recused')),

  focus_score          int check (focus_score          between 0 and 2),
  content_score        int check (content_score        between 0 and 2),
  interactivity_score  int check (interactivity_score  between 0 and 2),
  credibility_score    int check (credibility_score    between 0 and 2),

  focus_no_evidence          boolean not null default false,
  content_no_evidence        boolean not null default false,
  interactivity_no_evidence  boolean not null default false,
  credibility_no_evidence    boolean not null default false,

  feedback_liked    text,
  feedback_improve  text,
  private_note      text,

  recusal_reason  text,

  assigned_at   timestamptz not null default now(),
  first_opened_at timestamptz,
  updated_at    timestamptz not null default now(),
  submitted_at  timestamptz,

  unique (application_id, evaluator_id),

  -- a submitted assessment must be complete
  constraint submitted_is_complete check (
    state <> 'submitted' or (
      focus_score is not null and content_score is not null
      and interactivity_score is not null and credibility_score is not null
      and length(coalesce(feedback_liked, ''))   >= 20
      and length(coalesce(feedback_improve, '')) >= 20
      and submitted_at is not null
    )
  ),

  -- no_evidence forces a 0
  constraint no_evidence_forces_zero check (
    (not focus_no_evidence          or focus_score          = 0) and
    (not content_no_evidence        or content_score        = 0) and
    (not interactivity_no_evidence  or interactivity_score  = 0) and
    (not credibility_no_evidence    or credibility_score    = 0)
  )
);

create index on assessments (evaluator_id, state);
create index on assessments (application_id, state);

-- ---------------------------------------------------------- panel decisions
create table panel_decisions (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references applications(id) on delete cascade,
  decision        text not null
                  check (decision in ('accept','decline','defer','standby','reserve')),
  rationale       text,
  override_quality_standard boolean not null default false,
  override_reason text,
  decided_by      uuid not null references evaluators(id),
  decided_at      timestamptz not null default now()
);

create index on panel_decisions (application_id, decided_at desc);

-- ------------------------------------------------------------------ settings
create table settings (
  key         text primary key,
  value       jsonb not null,
  updated_by  uuid references evaluators(id),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------- audit log
create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references evaluators(id),
  actor_name  text,                 -- denormalised: survives evaluator deletion
  action      text not null,        -- 'assessment.submit', 'application.redact', ...
  entity      text not null,        -- 'assessment' | 'application' | 'settings' | ...
  entity_id   text,
  payload     jsonb,
  ip          text,
  at          timestamptz not null default now()
);

create index on audit_log (at desc);
create index on audit_log (entity, entity_id);
```

### 2.1 Seeded settings

```sql
-- db/migrations/002_settings_seed.sql
insert into settings (key, value) values
  ('assessors_per_application', '3'),
  ('session_minutes',           '50'),      -- decided: 50 min, including introduction and close
  ('youth_threshold',           '35'),      -- decided: under 35 (matches form Q27)
  ('ethnicity_options',         '"uk_census"'),  -- decided 2026-08-19; exact wording pending review
  ('small_room_slots',          '4'),       -- rooms that can host a sub-30 session; confirm with venue
  ('iaf_bonus_mode',            '"additive"'), -- team decision: IAF standing is a scored column
  ('quality_min_mean_total',    '5.0'),
  ('quality_min_mean_criterion','1.0'),
  ('target_outside_england_wales_pct', '50'),
  ('target_youth_pct',          '10'),
  ('divergence_threshold',      '2'),
  ('normalisation_min_submissions', '5')
on conflict (key) do nothing;
```

---

## 3. CSV import mapping — LIVE 18.08.2026 (4 rows 21-28.08)

> **Notă 01.09.2026 (Bogdan):** formularul live diferă de planul 19.08. Tabelul de mai jos reflectă **exportul real**. Mapping-ul din cod trebuie să folosească `starts-with` fuzzy pe header (primele 40 chars, case-insensitive) — vezi `lib/import/*`. Coloanele marcate `LIVE MISSING` există în PDF dar lipsesc din CSV (opțional/nullable până se repară formularul).

| # | Live CSV header (starts with) | Column | Type | Round | Notă |
|---|---|---|---|---|---|
| — | `Timestamp` | `submitted_at` | timestamptz | admin |  |
| 1 | `Username` | `q1_email` | text | **2** | live zice Username, nu Email — tot emailul aplicantului |
| 2 | `Before submitting this application` | `q2_ticket_status` | text[] | admin | **ultima coloană în CSV**, nu a 2-a |
| 3 | `The conference runs from Friday` | `q3_availability` | text[] | admin |  |
| 4 | `Will this session provide` | `q4_session_provides` | text[] | 1 | live Q8 suplimentar dar mapat ca fac focus |
| 5 | `Who will find your session of most value` | `q5_audience` | text[] | 1 |  |
| 6 | `Briefly describe in more detailed who would most benefit` | `q6_audience_detail` | text | 1 | **LIVE: contopit în Q5 în PDF nou — păstrat nullable; dacă coloana lipsește, derivă din Q5 text** |
| 7 | `Outline what your proposed session is about` | `q7_about_session` | text | 1 | ~999ch, HIGH LEAK RISK |
| 7b | `Session Benefits` | `q7b_benefits` | text | 1 | **NOU 18.08 — split din Q7** |
| 8 | `Imagining your planned session, what would be your ideal set up` | `q8_group_setup` | text[] | 1 | vezi §3.1 — opțiuni live vs plan |
| 9 | `Tell us about the room layout` | `q9_room_layout` | text | 1 | **LIVE: adesea gol — conținut mutat în Q8** |
| 9b | `What do you need in terms of tables and chairs` | `q9b_furniture` | text | 1 | **NOT IN LIVE 18.08 — păstrat nullable forward-compat** |
| 10 | `Are you planning to deliver this session solo` | `q10_delivery_mode` | enum | 1 | solo / one_cofacilitator / two_or_more |
| 11 | `Which theme do you feel your session is most aligned to` | `q11_theme` | enum | 1 | craft/clarity/change/challenge |
| 12 | `What do you do normally to ensure that you keep to allocated time` | `q12_timekeeping` | text | 1 |  |
| 13 | `Amount of Participation in my session` | `q13_participation_level` | int 1-5 | 1 | **LIVE MISSING din CSV (există în PDF Q13) — nullable până se fixează tipul întrebării în Forms** |
| 14 | `What methods are you likely to consider using` | `q14_methods` | text[] | 1 |  |
| 15 | `Give an example of something you do in the first 1-10 mins` | `q15_first_ten_minutes` | text | 1 |  |
| 16 | `Tell us briefly about your facilitation pathway` | `q16_pathway` | text | 1 | HIGH LEAK RISK |
| 17 | `Are you a member of IAF` | `q17_iaf_member` | enum | 1 |  |
| 18 | `Which of these IAF qualifications do you have` | `q18_iaf_qualification` | enum | 1 |  |
| 19 | `Tell us about your experiences facilitating large group sessions` | `q19_large_groups_english` | text | 1 | HIGH LEAK RISK |
| 20 | `What is your full name` | `q20_full_name` | text | **2** |  |
| 21 | `Give a brief description of yourself` | `q21_bio` | text | **2** | **LIVE MISSING din CSV — nullable** |
| 22 | `Add a head shot` | `q22_headshot_url` | text | **2** | **LIVE MISSING din CSV (File upload nu iese în CSV) — nullable** |
| 23 | `If you have co-facilitators` | `q23_cofacilitators` | text | **2** |  |
| 24 | `Please tell us which country you based in currently` | `q24_region` | text | **2** | **live = text liber (țară), nu enum region — importul derivă region via tabel țări→region (vezi §3.1)** |
| 25 | `How would you describe your racial and ethnic background` | `q25_ethnicity` | text | **2** |  |
| 26 | `Where would you describe yourself in terms of your career stage` | `q26_career_stage` | text | **2** |  |
| 27 | `Are you under 35` | `q27_under_35` | boolean | **2** |  |
| 28 | `What gender do you identify with` | `q28_gender` | text | **2** | |

### 3.1 Question 8 — group size options (LIVE 18.08 vs plan 19.08)

The venue is capped at ~200 delegates across 4 tracks, so the average session is 30–50
people and most sessions must target the larger end. The form's old options undershot
this. The revised set:

```
30-40 in a circle
30-40 around tables
Up to 50
Above 50
Fully flexible
Needs to be under 30
```

The form carries a note that only a limited number of small-group slots exist. Treat
`Needs to be under 30` as a scarce resource in the programme balance dashboard: show a
count of small-group sessions in the selected set against the number of small rooms
available (setting `small_room_slots`, default 4 — confirm with the venue).

**LIVE 18.08 (CSV actual):** `20 people in a circle / 40 people in small group tables / Between 30 to 50 / More than 50 / Other:` — importul accepta ambele seturi; valori ne-mapate → `q8_group_setup_other`. `q24_country → region` se deriva: `England and Wales → england_wales`, `Scotland/Ireland → scotland_ireland`, rest → `europe`/`middle_east`/`rest_of_world`.

**The wording of Q8 and Q9b is not final.** Match CSV headers loosely (case-insensitive
substring on the first 40 characters) and surface unmatched headers in the import report
rather than failing. The form is still being edited while this is built.

**Multi-select parsing:** Google joins checkbox answers with `", "`. Split on `", "` and
trim. Values that do not match a known option go to the corresponding `_other` column.
Never drop a value silently — unmapped values are listed in the import report.

**Enum normalisation:** lowercase, replace non-alphanumerics with `_`, then match against
the allowed set. A value that does not match halts the import for that row and is listed
in the report. Do not guess.

**Deduplication:** a row whose `q1_email` already exists in the same wave is reported as a
duplicate and skipped unless the operator ticks "replace existing".

**Ref codes:** `W{wave_number}-{seq:03d}` assigned in submission-time order at import.

---

## 4. Field visibility classes — enforced on the server

This is rule R1 from the brief. Implement it as **allow-lists**, not deny-lists, in
`lib/visibility.ts`. A new column added to `applications` must be invisible by default.

```ts
// lib/visibility.ts
export const ROUND1_FIELDS = [
  "id", "ref_code", "wave_id", "q11_theme",
  "q4_session_provides", "q4_session_provides_other",
  "q5_audience", "q5_audience_other", "q6_audience_detail",
  "q7_about_session", "q7b_benefits", "q8_group_setup", "q8_group_setup_other",
  "q9_room_layout", "q10_delivery_mode", "q12_timekeeping",
  "q13_participation_level", "q14_methods", "q14_methods_other",
  "q15_first_ten_minutes", "q16_pathway",
  "q17_iaf_member", "q18_iaf_qualification",
  "q19_large_groups_english",
] as const;

export const IDENTITY_FIELDS = [
  "q1_email", "q2_ticket_status", "q3_availability",
  "q20_full_name", "q21_bio", "q22_headshot_url", "q23_cofacilitators",
  "q24_region", "q25_ethnicity", "q26_career_stage",
  "q27_under_35", "q28_gender",
] as const;
```

`getApplicationForAssessor(id)` must:

1. `select` only `ROUND1_FIELDS` — spell the columns out in the SQL. Never `select *`
   followed by a JavaScript filter; a serialisation mistake then leaks the whole row.
2. Substitute redactions: if `redacted_q7` is non-null, return it as `q7_about_session`; `redacted_q7b` → `q7b_benefits`.
   Same for `q16`, `q19`.
3. Return `iaf_standing: undefined`. IAF standing is not shown during scoring.

Write a unit test that imports `ROUND1_FIELDS` and `IDENTITY_FIELDS`, and asserts their
intersection is empty. Write a second test that calls `getApplicationForAssessor` against
a seeded row containing a distinctive identity string and asserts that string appears
nowhere in `JSON.stringify(result)`.

---

## 5. Anonymity leak scan (runs at import)

For each imported row, scan `q7_about_session`, `q7b_benefits`, `q16_pathway`, `q19_large_groups_english`:

1. **Name tokens** — split `q20_full_name` on whitespace, keep tokens of 3+ characters,
   case-insensitive whole-word match.
2. **Email local part** — the part of `q1_email` before `@`, if 4+ characters.
3. **URLs and domains** — regex `\b(?:https?://|www\.)\S+|\b[a-z0-9-]+\.(?:com|org|net|co\.uk|ro|eu|de|fr|nl)\b`.
4. **Explicit self-reference** — `/\bI (?:am|'m) [A-Z][a-z]+/`, `/\bmy (?:company|firm|consultancy) \b/i`.

Any hit sets `anonymity_flag = true` and appends a human-readable line to
`anonymity_notes` (e.g. `q16: contains applicant name "Ingrid"`). Flagged applications
cannot be released for scoring until a lead has either redacted them or explicitly
dismissed the flag — both actions are audited.

The scan is a heuristic. It is a net, not a guarantee; the import report must say so.
