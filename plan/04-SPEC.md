# Functional Specification

---

## 1. Roles

| Role | Can |
|---|---|
| **Assessor** | See their own queue; open applications assigned to them in anonymous form; score and submit; see other assessors' scores on an application **only after submitting their own**; recuse themselves. |
| **Lead** | Everything an assessor can, plus: import, redact, assign, see identities, see all scores at any time, record panel decisions, use the programme balance dashboard, change settings, export. |

There is no separate "admin" role. A lead is an admin.

---

## 2. Authentication

### 2.1 Flow

```
/login          POST password  →  session cookie { authed: true }
   ↓
/who            POST evaluatorId  →  session cookie { authed: true, evaluatorId, role }
   ↓                                  (if the chosen evaluator has role='lead',
   ↓                                   the request must also carry the admin password)
/               the app
```

- The shared password is checked against `APP_PASSWORD_HASH` (argon2 or bcrypt).
- The lead password is checked against `ADMIN_PASSWORD_HASH`.
- The session is a **JWT signed with `SESSION_SECRET`** (`jose`, HS256), stored in an
  HttpOnly, Secure, SameSite=Lax cookie named `fa27_session`, 30-day expiry.
- `middleware.ts` redirects to `/login` when `authed` is missing, and to `/who` when
  `evaluatorId` is missing. `/login`, `/who` and `/api/auth/*` are exempt.
- Every route handler re-reads and re-verifies the session. **Never trust a header or a
  body field for identity.**
- 5 failed password attempts from one IP within 10 minutes → 429 for 15 minutes
  (in-memory counter is acceptable; a single Vercel region is fine for 6 users).

### 2.2 A "Switch user" link is present in the header

Because identity is self-selected, switching is cheap and must be visible rather than
hidden — an assessor who scores under the wrong name corrupts the data silently.
The header always shows: `Signed in as **Name**` + `Switch`.

### 2.3 Seed evaluators (fictional — the product owner will replace them)

| Name | Email | Role |
|---|---|---|
| Ingrid Halvorsen | ingrid@example.org | lead |
| Marco Ferretti | marco@example.org | assessor |
| Amina Yusuf | amina@example.org | assessor |
| Tomás Ribeiro | tomas@example.org | assessor |
| Katja Novak | katja@example.org | assessor |
| Daniel Brennan | daniel@example.org | assessor |

Names, emails and roles are editable in `/admin/evaluators` (task T16) — the product
owner must not need a developer to swap them.

---

## 3. Screens

### M1 — assessor path

#### 3.1 `/login`
Single centred card. App name, one password field, one button. On failure: inline error,
no detail about which part was wrong. No "forgot password" — it is a shared secret.

#### 3.2 `/who`
Grid of evaluator cards (initials avatar, name, role badge). Clicking a lead card expands
a second password field inline. Copy above the grid: `Select your name. Your scores are
recorded under this name.`

#### 3.3 `/` — Assessor dashboard

- Header: wave name, wave status.
- **Progress**: a ring showing `submitted / assigned`, plus text `4 of 11 assessments
  submitted`.
- **Primary action**: a large `Start next assessment` button that opens the oldest
  assigned-but-not-submitted application. This is the button people will use 90% of the
  time — everything else is secondary.
- **Your queue**: a list, three tabs — `To do` (default) / `Submitted` / `Recused`.
  Each row: ref code, theme badge, first 120 characters of the session description,
  a `Draft` chip when partially filled, and time since assignment.
- Leads additionally see a `Panel` section linking to lead screens.

#### 3.4 `/review/[id]` — the scoring screen

This is the screen the panel lives in. Everything else is scaffolding.

**Layout, desktop ≥1024px**: two columns, `minmax(0,1.15fr) minmax(420px,0.85fr)`.

*Left column — the application.* Independently scrollable. Content grouped into four
sections in the same order as the criteria, each section headed with the criterion name
so the assessor reads exactly what they are about to score:

| Section | Shows |
|---|---|
| 1. Facilitation Focus | Q4 (as chips), Q5 (chips), Q6, Q11 theme badge |
| 2. Session Content | A fixed reminder line — `The session slot is {settings.session_minutes} minutes, including the host's introduction and close.` — then Q7 (the main text, largest type), Q12, Q8 (chips), Q9 |
| 3. Interactivity | Q13 as a 1-5 meter labelled `Self-reported by the applicant`, Q14 (chips), Q15, Q10 |
| 4. Credibility and Experience | Q16, Q19 |

Q17/Q18 are **not** shown. A note at the bottom reads: `IAF membership is recorded
separately and is not part of this assessment.`

**Scoring is per criterion, not per question.** The assessor reads a whole section, then
awards one score for it. Never render a score control next to an individual question —
that is the behaviour the panel explicitly decided against, because it turns a holistic
judgement into arithmetic over answers.

*Right column — the scoring panel.* Sticky, does not scroll away.

For each criterion, in order:

- criterion title and question;
- three large radio cards, `0 Below standard` / `1 Meets standard` / `2 Above standard`,
  **with the full anchor text from `02-RUBRIC.md` printed inside each card** — not a
  tooltip, not a popover;
- the `No evidence provided in the application` checkbox; ticking it selects 0 and
  disables the three cards;
- a thin link `Jump to the evidence ↑` that scrolls the left column to that section.

Then the two required feedback textareas and the optional private note.

*Footer bar* (sticky, bottom of the right column):
`Submit assessment` — disabled with an explanatory tooltip until all four criteria are
scored and both feedback fields have ≥20 characters. Beside it: `Save draft`, `I know
this applicant — recuse me`, and a live `Total: 6 / 8`.

**Autosave**: every change PATCHes the draft after 800ms of inactivity. A quiet
`Saved 14:32` indicator. Never block the UI on a save.

**Keyboard**: `1`/`2`/`3` set the score for the focused criterion; `Tab` moves to the
next; `Cmd/Ctrl+Enter` submits. A `?` key opens a shortcut sheet.

**Mobile (<1024px)**: one column, application section followed immediately by the score
control for that section, so the reader never scrolls back and forth. Footer bar stays
fixed.

**On submit**: full-screen confirmation with the assessor's own scores, then two buttons:
`See how the panel scored this` and `Next assessment →`. Submitting is final; changing a
submitted assessment requires a lead to reopen it (audited).

#### 3.5 `/review/[id]/compare` — the reveal

Reachable only after the current assessor's own assessment is `submitted`, or by a lead.
Server returns 403 otherwise — this is rule R2 and needs its own test.

- A 4×N matrix: criteria as rows, assessors as columns, plus a mean column.
- Cells where `max - min ≥ 2` for that criterion get a divergence outline and a
  `Disagreement` label on the row.
- Below: each assessor's feedback, side by side.
- A `Comments` thread on the application for resolving disagreement in writing
  (`assessment_comments` is out of scope for M1 — use a single free-text
  `panel_discussion` field on the application, appended with author and timestamp).

### M2 — lead path

#### 3.6 `/applications` — ranking table
Sortable, filterable table: ref, theme, mean total, normalised total, per-criterion means,
assessments submitted (`2/3`), divergence flag, quality standard pass/fail, status.
Filters: wave, theme, status, `needs calibration`, `below standard`.
Row click → detail. Bulk actions: shortlist, defer, decline.

#### 3.7 `/applications/[id]` — full record (identity revealed)
Everything from round 1, plus the identity block, plus every assessment, plus the
**aggregated applicant feedback draft**: the `feedback_liked` entries concatenated under
one heading, `feedback_improve` under a second, no-evidence flags rendered as their own
bullet list, with a `Copy` button. Decision controls: accept / decline / defer / standby /
reserve, each requiring a rationale. Overriding the quality standard requires a reason.

#### 3.8 `/panel` — programme balance dashboard
The screen that Google Sheets cannot do. Operates on the current `accepted` +
`shortlisted` set and updates live as decisions change.

Target cards, each showing `current / target` with a progress bar and a pass/miss state:

- lead hosts from outside England and Wales — target ≥50% (`q24_region` derivat din `q24 country` text liber — vezi `03-DATA-MODEL.md §3.1`);
- lead hosts under the youth threshold — target ≥10% (`q27_under_35`);
- theme distribution across CRAFT / CLARITY / CHANGE / CHALLENGE — target: no theme below
  15% of the programme;
- group-size mix from `q8_group_setup` against room capacity (live 18.08 nu are `Needs to be under 30` — vezi `03-DATA-MODEL.md §3.1`), with sessions marked `Needs to be under 30` counted against `settings.small_room_slots` when prezente — a hard scarcity,
  shown in red once exceeded;
- solo vs co-facilitated (`q10_delivery_mode`);
- career stage spread (`q26_career_stage`);
- ethnic background — UK Census categories (`ethnicity_options = 'uk_census'`). Shown as
  counts only, never as a per-application attribute in any ranking view, and excluded from
  every export except `scope=full`.

Below the cards: three columns — `Selected`, `Reserve`, `Not selected` — with drag or
button moves between them. Every move recomputes the cards immediately, so the panel can
see the cost of a swap while they are discussing it.

#### 3.9 `/admin/import`
Upload CSV → header mapping table with auto-matched columns and manual override selects →
`Dry run` producing a report (rows parsed, duplicates, unmapped enum values, anonymity
flags) → `Import` commits. Both steps show the same report format. Never import on upload.

#### 3.10 `/admin/assignments`
Shows the assignment matrix (applications × evaluators). `Auto-assign` runs the engine for
unassigned applications in the wave. Manual add/remove per cell. Load counters per
evaluator. Warns before removing an assignment that has a draft.

### M3

#### 3.11 `/admin/settings` — every value from `settings`. One entry,
`ethnicity_options`, is still unresolved at the policy level and is shown at the top with
its explanatory note; it is `null` until the application form defines the options, and the
panel dashboard renders `Not configured` for as long as it stays null.

#### 3.12 `/admin/evaluators` — CRUD, deactivate rather than delete.

#### 3.13 `/calibration` — mark a small set of applications as the calibration set;
those get assigned to **all** active evaluators; when all have submitted, a comparison
view shows each assessor's mean per criterion against the group mean, so systematic
severity differences surface before the real scoring starts.

#### 3.14 `/admin/audit` — reverse-chronological audit log with entity filters.

---

## 4. API surface

All handlers: `zod` validation, session verification, audit write on mutation.
All responses `application/json`. Errors: `{ error: string, code: string }`.

```
POST   /api/auth/login              { password }
POST   /api/auth/select-evaluator   { evaluatorId, adminPassword? }
POST   /api/auth/logout

GET    /api/me                      → { evaluator, role, counts }

GET    /api/queue                   → assessor's assignments, grouped by state
GET    /api/applications/:id/round1 → ROUND1_FIELDS only. 403 if not assigned and not lead.
PATCH  /api/assessments/:id         → save draft (partial)
POST   /api/assessments/:id/submit  → validate complete, set state, timestamp
POST   /api/assessments/:id/recuse  { reason }
GET    /api/applications/:id/panel  → all assessments. 403 unless own submitted, or lead.

# lead only
POST   /api/import/dry-run          multipart CSV → report
POST   /api/import/commit           multipart CSV + mapping → report
POST   /api/applications/:id/redact { field, text }
POST   /api/applications/:id/dismiss-flag { reason }
POST   /api/assignments/auto        { waveId, perApplication }
POST   /api/assignments             { applicationId, evaluatorId }
DELETE /api/assignments/:id
GET    /api/applications            → ranking rows (query: wave, theme, status, flags)
POST   /api/applications/:id/decision { decision, rationale, override?, overrideReason? }
GET    /api/panel/balance           → target computations for the current set
GET    /api/export                  ?format=csv|xlsx&scope=scores|feedback|full
GET    /api/settings  /  PUT /api/settings
GET    /api/evaluators / POST / PATCH
GET    /api/audit                   ?entity=&entityId=&limit=
```

---

## 5. Assignment engine

`POST /api/assignments/auto` with `{ waveId, perApplication = settings.assessors_per_application }`.

Algorithm — deterministic, greedy, no randomness (so a re-run is reproducible and a lead
can predict the outcome):

1. Applications in the wave with status `imported` **and** `anonymity_flag = false`
   (or flag dismissed), ordered by `ref_code`.
2. Active evaluators, ordered by current load ascending, then by name.
3. For each application, take the `perApplication` evaluators with the lowest current
   load, skipping any who already have an assessment on it, and any who have recused
   themselves from it.
4. Increment their load, insert `assessments` rows in state `assigned`.
5. Set the application status to `scoring`.

Constraints:
- Never assign an application to an evaluator twice.
- Never remove or overwrite an existing assessment.
- If fewer than `perApplication` evaluators are available, assign what is possible and
  report the shortfall. Do not fail the whole run.
- Report the resulting load spread; warn if max−min load > 2.

---

## 6. Aggregation and ranking

Implement in `lib/scoring.ts`, pure functions, unit-tested. Never compute these in a
component.

### 6.1 Per-application aggregates
Over **submitted** assessments only (drafts and recusals are excluded everywhere):

```
n                        = count of submitted assessments
mean_focus               = avg(focus_score)
mean_content             = avg(content_score)
mean_interactivity       = avg(interactivity_score)
mean_credibility         = avg(credibility_score)
mean_total               = mean_focus + mean_content + mean_interactivity + mean_credibility
                           (equivalently: avg of each assessment's total)
range_<criterion>        = max - min
divergence               = max(range_<criterion> across the four)
```

Round for display to one decimal; never round before summing.
When `n = 0`, all aggregates are `null` and the row shows `Not yet scored`.

### 6.2 Quality standard
Per `02-RUBRIC.md §5`. Compute a `qualityStatus` of `pass` | `below_standard` |
`insufficient_data` (when `n < 2`).

### 6.3 Assessor normalisation (hawk/dove)

Displayed as a secondary column, never as the primary ranking.

```
For each evaluator e with at least settings.normalisation_min_submissions submitted
assessments:
    mean_e, sd_e  over the totals (0..8) that e has awarded
For the panel:
    mean_g, sd_g  over all submitted totals

adjusted(total, e) = sd_e > 0.25
    ? mean_g + (total - mean_e) * (sd_g / sd_e)
    : total                                   // degenerate spread, leave the score alone

normalised_total(application) = mean of adjusted(total, e) over its submitted assessments,
                                clamped to [0, 8]
```

Evaluators below the minimum submission count contribute their raw total. The UI must
label the column `Normalised` with a tooltip explaining, in one sentence, that it corrects
for assessors who score systematically higher or lower than the panel average.

### 6.4 Ranking order

```
1. mean_total                 desc
2. iaf_standing               desc     (only when settings.iaf_bonus_mode = 'tiebreak')
3. mean_interactivity         desc
4. mean_content               desc
5. ref_code                   asc      (stable, deterministic)
```

**Default is `additive`** (selection team, 2026-08-19): `iaf_standing` is added to
`mean_total`, the maximum becomes 10, and step 2 is skipped because the bonus is already in
the total. The UI must state which mode is active wherever a total is shown, and the
quality standard is always computed on the primary 0–8 score (`02-RUBRIC.md §5`).

---

## 7. Status transitions

```
imported ──(assign)──▶ scoring ──(all submitted)──▶ scored
                                                      │
                                 ┌────────────────────┼────────────────────┐
                                 ▼                    ▼                    ▼
                            shortlisted           declined             deferred
                                 │                                        │
                     ┌───────────┴──────────┐                    (rolled into a
                     ▼                      ▼                     later wave)
                 accepted                standby
```

`withdrawn` can be reached from any state by a lead. Every transition is audited with the
actor, the previous status and the rationale.

---

## 8. Export

`GET /api/export`:

- `scope=scores` — one row per application: ref, theme, means, normalised, n, divergence,
  quality status, status, and per-assessor totals in named columns. This is the
  replacement for the current spreadsheet.
- `scope=feedback` — one row per application: ref, applicant name, email, and the
  assembled applicant-facing feedback text. Never includes private notes.
- `scope=full` — everything, including identity fields. Leads only, and the export itself
  is audited.

CSV via a hand-written serialiser (quote every field, escape `"` by doubling, CRLF line
endings, UTF-8 BOM so Excel opens it correctly). XLSX is out of scope — CSV opens in both
Excel and Google Sheets, which is the actual requirement.

---

## 9. Error handling and empty states

Every list screen needs three states, all designed, not left to chance:
`loading` (skeleton), `empty` (an illustration-free card with one sentence explaining what
would put something here, and the action that does it), `error` (what failed, and a retry
button). No spinner-only screens. No `null` renders.

Specific empty states worth writing well:
- Assessor dashboard, nothing assigned: `You have no assessments yet. A panel lead assigns
  applications once a wave opens.`
- Applications table, nothing imported: `No applications yet. Import a CSV export from the
  application form to get started.` + button.
- Panel balance, nothing selected: `Shortlist some applications to see how the programme
  balances against the conference targets.`
