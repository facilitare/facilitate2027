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
