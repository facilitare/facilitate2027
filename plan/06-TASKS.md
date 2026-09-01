# Task Queue

Work top to bottom. One commit per task, message prefixed with the task id.
A task is done only when every acceptance criterion has been **run and observed**.
See `00-AGENT-BRIEF.md §6`.

Legend: **AC** = acceptance criteria. **OOS** = explicitly out of scope for this task.

---

# Milestone 1 — Assessors can score

## T01 · Project setup

Create the Next.js 15 app (TypeScript, App Router, Tailwind v4, `src/` not used — use
`app/`, `lib/`, `components/`, `db/`).

Files: `package.json`, `tsconfig.json`, `next.config.ts`, `app/globals.css`,
`app/layout.tsx`, `.env.example`, `README.md`, `vitest.config.ts`.

`.env.example`:
```
DATABASE_URL=
APP_PASSWORD_HASH=
ADMIN_PASSWORD_HASH=
SESSION_SECRET=
```

Add `npm run db:migrate`, `npm run db:seed`, `npm run hash -- <password>` (prints a hash
to paste into env).

Also: run `git init` if the repository is not yet under version control, add a
`.gitignore` covering `node_modules`, `.next`, `.env*` (except `.env.example`) and
`.vercel`, and make the initial commit.

**AC**
1. `npm run dev` serves a page at `/` with the fonts and colour tokens from `05-DESIGN.md`
   applied; toggling the OS between light and dark visibly changes the page.
2. `npm run build`, `npx tsc --noEmit` and `npm test` all pass.
3. No secret values are committed; `.env*` is gitignored except `.env.example`.
4. `git log` shows the initial commit and `git status` is clean.

**OOS** any screen, any database access.

---

## T02 · Database schema and migrations

Implement `db/migrations/001_init.sql` and `002_settings_seed.sql` exactly as written in
`03-DATA-MODEL.md §2`. Write `db/migrate.ts` (applies files in filename order, records
applied names in a `_migrations` table, idempotent) and `lib/db/client.ts` wrapping
`@neondatabase/serverless`.

Write `db/seed.ts` per `00-AGENT-BRIEF.md §7`: 6 evaluators, 1 wave, 12 synthetic
applications spanning all four themes, all regions, participation levels 1–5, two of them
deliberately weak, one deliberately off-topic (to exercise the gate rule), and two
containing self-identifying text (to exercise the anonymity scan).

**AC**
1. `npm run db:migrate` on an empty database creates every table; running it a second time
   changes nothing and exits 0.
2. `npm run db:seed` is idempotent (re-running does not duplicate rows).
3. Inserting an assessment with `state='submitted'` and a null score is rejected by the
   database, not by the application.
4. Inserting `focus_no_evidence = true` with `focus_score = 2` is rejected by the database.

---

## T03 · Authentication and session

Implement `04-SPEC.md §2` in full: `lib/auth.ts` (hash verify, JWT sign/verify),
`middleware.ts`, `app/login/page.tsx`, `app/who/page.tsx`, the three
`/api/auth/*` handlers, `GET /api/me`, and the header's `Signed in as … · Switch`.

**AC**
1. Visiting any route while logged out lands on `/login`.
2. A correct password then a chosen assessor lands on `/`; the cookie is HttpOnly, Secure,
   SameSite=Lax (verify in devtools).
3. Choosing a **lead** without the admin password is rejected; with it, succeeds.
4. Editing the cookie's payload by hand invalidates the session (signature check).
5. Six wrong passwords in a row from the same client return 429.
6. `POST /api/auth/logout` clears the cookie and the next request redirects to `/login`.

---

## T04 · Design system primitives

Build the components in `05-DESIGN.md §4–5` in `components/ui/`: `Button`, `Card`,
`Chip`, `ThemeBadge`, `ScoreControl`, `ParticipationMeter`, `ProgressRing`,
`StickyActionBar`, `Toast`, `EmptyState`, `Skeleton`, `ThemeToggle`.

Build a `/styleguide` route rendering every component in every state (default, hover,
focus, selected, disabled, error). This route stays in the app permanently — it is how a
future maintainer checks a change did not break something else.

**AC**
1. `/styleguide` renders every component in every listed state, in both themes.
2. `ScoreControl` is fully keyboard operable: arrows move, `1`/`2`/`3` select, focus ring
   visible, `aria-checked` correct on the selected option.
3. Ticking `No evidence provided` forces the value to 0, disables the options and shows
   the explanation line.
4. Contrast of every text/background pair in the styleguide meets WCAG AA (check with a
   contrast tool; record the results in the commit message).

---

## T05 · CSV import

`app/admin/import/page.tsx`, `POST /api/import/dry-run`, `POST /api/import/commit`, and
`lib/import/*`: header matching against `03-DATA-MODEL.md §3`, multi-select splitting,
enum normalisation, dedupe, ref-code assignment.

Ship a fixture at `db/fixtures/sample-responses.csv` with 12 rows including: a duplicate
email, an unmapped multi-select value, a malformed enum, an empty required field, and a
row whose free text contains the applicant's own name.

> **Live 18.08:** fixture must use **live CSV headers** (Username, Outline..., Session Benefits, Imagining your ideal set up..., country text) and include a row missing Q13 / Q21 / Q22 to prove nullable handling. Map Q24 country→region in import (see `03-DATA-MODEL.md §3`).

**AC**
1. Uploading the fixture produces a dry-run report listing exactly: 12 rows read,
   1 duplicate, 1 unmapped value (named), 1 malformed enum (row and value named),
   1 anonymity flag (field and reason named).
2. The dry run writes nothing to the database (verify with a row count before and after).
3. Commit imports the valid rows, assigns sequential `W1-001…` ref codes in submission
   order, and produces the identical report.
4. Re-importing the same file reports every row as a duplicate and imports nothing.
5. A malformed enum never becomes `null` silently — the row is rejected and named.

---

## T06 · Anonymity layer

`lib/visibility.ts` and `lib/anonymity.ts` per `03-DATA-MODEL.md §4–5`.
`GET /api/applications/:id/round1`. Lead-side redaction UI on the application detail page
(field, original text, editable redacted text, save) and `dismiss-flag`.

**AC**
1. The unit test asserting `ROUND1_FIELDS ∩ IDENTITY_FIELDS = ∅` passes.
2. The leak test passes: a seeded application whose `q20_full_name` is `Wilhelmina
   Okonkwo` returns a round-1 payload in which the string `Okonkwo` does not appear
   anywhere, including inside `q7`/`q7b`/`q16`/`q19` when a redaction exists.
3. The generated SQL for round 1 names its columns explicitly — grep the file to confirm
   no `select *` reaches an assessor-facing path.
4. An application with `anonymity_flag = true` cannot be auto-assigned until redacted or
   dismissed; the assignment run reports it as skipped and says why.
5. Redacting and dismissing both write `audit_log` rows naming the actor and the field.

---

## T07 · Assignment engine

`lib/assignment.ts` and the three assignment endpoints per `04-SPEC.md §5`.
`app/admin/assignments/page.tsx` with the matrix, `Auto-assign`, manual add/remove, and
per-evaluator load counters.

**AC**
1. Auto-assigning 12 applications to 6 evaluators at 3 each produces exactly 36
   assessments, and no evaluator has more than one more than any other.
2. Running auto-assign twice does not create duplicates and does not touch existing rows.
3. An evaluator who recused themselves from an application is never reassigned to it.
4. Removing an assignment that has a draft asks for confirmation first and, once
   confirmed, is audited.
5. With only 2 active evaluators and `perApplication = 3`, the run completes, assigns 2
   per application, and reports the shortfall rather than failing.

---

## T08 · Assessor dashboard

`app/page.tsx` per `04-SPEC.md §3.3`, `GET /api/queue`.

**AC**
1. Counts on the ring match the database exactly for the signed-in evaluator.
2. `Start next assessment` opens the oldest assigned, unsubmitted application; when there
   are none, the button is replaced by the "all done" empty state.
3. Applications assigned to other evaluators never appear, and requesting one of them by
   id returns 403.
4. Partially filled assessments show a `Draft` chip.

---

## T09 · Review screen

`app/review/[id]/page.tsx` per `04-SPEC.md §3.4` and `05-DESIGN.md §4`.
`PATCH /api/assessments/:id`, `POST /api/assessments/:id/submit`,
`POST /api/assessments/:id/recuse`.

**AC**
1. Every field listed in the four left-column sections is rendered, in the specified
   order, with applicant prose in the serif face capped at 68ch.
2. Q17 and Q18 are absent from the page **and** from the network payload.
3. All four rubric anchors are readable on screen without hovering or clicking.
4. Autosave fires 800ms after the last change and shows a timestamp; a full page reload
   restores every draft value.
5. `Submit` stays disabled until all four criteria are scored and both feedback fields
   reach 20 characters; the disabled tooltip says which requirement is unmet.
6. After submit, the assessment is immutable: a further PATCH returns 409.
7. Recusal sets the state, records the reason, removes it from the queue and audits it.
8. At 375px width the screen is usable: one column, no horizontal scroll, action bar
   reachable.
9. The whole flow — open, score, feedback, submit — is completable with the keyboard alone.

---

## T10 · Reveal and compare

`app/review/[id]/compare/page.tsx`, `GET /api/applications/:id/panel` per
`04-SPEC.md §3.5`. Implements rule R2.

**AC**
1. Requesting the panel view for an application whose own assessment is not `submitted`
   returns **403**, both from the API directly and through the UI.
2. A lead receives the panel view at any time.
3. Criteria with a range ≥2 are marked with the divergence border **and** the word
   `Disagreement`.
4. The mean shown equals the value computed by `lib/scoring.ts` for the same data.

---

## T11 · Scoring library

`lib/scoring.ts` per `04-SPEC.md §6` — pure functions only, no database, no React.

**AC**
1. Unit tests cover: `n = 0`; `n = 1`; unanimous scores; maximum divergence; the gate rule
   dropping a high-total application to `below_standard`; both `iaf_bonus_mode` values;
   the `sd_e = 0` guard in normalisation; an evaluator below the minimum submission count
   contributing their raw total.
2. A hand-computed worked example is included as a test with its arithmetic written out in
   a comment, so a future reader can verify the formula without re-deriving it.
3. No rounding happens before the final display value.

---

# Milestone 2 — Leads can decide

## T12 · Applications ranking table
`app/applications/page.tsx`, `GET /api/applications` per `04-SPEC.md §3.6`.

**AC** (1) Sorting by every numeric column is correct and stable. (2) Each filter narrows
the set correctly and combines with the others. (3) Ranking order matches
`04-SPEC.md §6.4` exactly, tiebreaks included. (4) 200 rows render without noticeable lag.
(5) An assessor who reaches this route gets 403.

## T13 · Application detail, decisions, aggregated feedback
`app/applications/[id]/page.tsx`, `POST /api/applications/:id/decision`,
`lib/feedback.ts` (assembly per `04-SPEC.md §3.7`).

**AC** (1) Identity fields appear here and only here. (2) The assembled feedback contains
every assessor's two fields and every no-evidence flag as its own bullet, and no private
notes. (3) `Copy` puts exactly the rendered text on the clipboard. (4) A decision requires
a rationale; overriding the quality standard requires a separate reason; both are audited
with the previous status.

## T14 · Programme balance dashboard
`app/panel/page.tsx`, `GET /api/panel/balance` per `04-SPEC.md §3.8` and `05-DESIGN.md §7`.

**AC** (1) Every target card recomputes within 300ms of moving an application between
columns. (2) Percentages match a hand count on the seed data. (3) The Q25 card renders the
`Not configured` message rather than a number. (4) Each chart has a visually hidden table
with the same figures. (5) The youth card names the threshold it is using and links to the
setting.

## T15 · Export
`GET /api/export` per `04-SPEC.md §8`, `lib/csv.ts`.

**AC** (1) All three scopes download and open correctly in both Excel and Google Sheets,
including a field containing a comma, a double quote and a newline. (2) `scope=feedback`
contains no private notes — asserted by a test. (3) `scope=full` is refused for assessors
and audited for leads. (4) UTF-8 BOM present; non-ASCII names survive the round trip.

---

# Milestone 3 — Operations

## T16 · Settings and evaluators
`app/admin/settings/page.tsx`, `app/admin/evaluators/page.tsx`, the settings and
evaluators endpoints.

**AC** (1) Changing `assessors_per_application` changes the next auto-assign run.
(2) Changing `iaf_bonus_mode` to `additive` changes totals and ranking everywhere, and
every screen showing a total says which mode is active. (3) `ethnicity_options` appears
first with its explanatory note, and setting it from `null` to a list switches the panel
dashboard's Q25 card from `Not configured` to a real breakdown. (4) Changing
`session_minutes` changes the reminder line on the review screen. (4) Evaluators are deactivated, never deleted;
a deactivated evaluator's submitted assessments still count. (5) Every settings change is
audited with the old and new value.

## T17 · Calibration mode
`app/calibration/page.tsx`. Marking applications as the calibration set assigns them to
all active evaluators; when all have submitted, show per-assessor mean per criterion
against the panel mean.

**AC** (1) A calibration application is assigned to every active evaluator regardless of
`assessors_per_application`. (2) The comparison view is unavailable until every assessor
has submitted, and says how many are outstanding. (3) Each assessor's deviation from the
panel mean is shown per criterion, signed, to one decimal.

## T18 · Audit viewer and hardening
`app/admin/audit/page.tsx`, `GET /api/audit`. Then a pass over every route handler
confirming: zod validation present, session verified, audit written on mutation, and no
`select *` on an assessor-facing path.

**AC** (1) Every mutating endpoint in `04-SPEC.md §4` produces an audit row — verified by
exercising each one and reading the log. (2) Filtering by entity and entity id works.
(3) A written checklist in the commit message lists each route handler and confirms the
four properties above.
