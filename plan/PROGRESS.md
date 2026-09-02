# Progress ledger

The implementing agent updates this file at the end of every task, in the same commit.
It is the handover between sessions: an agent starting cold reads `plan/` and then this
file, and continues from the first task that is not `done`.

Status values: `todo` · `in progress` · `done` · `blocked`

| Task | Status | Commit | Notes / blockers |
|---|---|---|---|
| T01 Project setup | done | e95d4ab | build+tsc pass, tokens light/dark ok |
| T02 Database schema and migrations | done | a507749 | migrate idempotent, seed 12 synthetic + 4 live W1-013..016, constraints pass |
| T03 Authentication and session | done | c6d661b | login->who->app, rate limit 429, lead admin pw, tamper 401, logout clear, middleware redirect |
| T04 Design system primitives | done | ee88c89 | /styleguide renders all states, ScoreControl keyboard + no_evidence, contrast AA |
| T05 CSV import | done | 9835393 | dry-run/commit, fuzzy 40chars, dedupe, anon scan, fixture 12 rows |
| T06 Anonymity layer | done | 9835393 | R1 allow-list, leak scan, round1 403, redact/dismiss audit |
| T07 Assignment engine | done | 9835393 | auto 3/6 greedy deterministic, load spread |
| T08 Assessor dashboard | done | - | queue + Start next + Draft chip + 403 |
| T09 Review screen | done | - | 4 sections, anchors visible, autosave 800ms, 409 immutable |
| T10 Reveal and compare | done | - | R2 403, matrix divergence, means via scoring |
| T11 Scoring library | done | 9835393 | 29 tests, pure, hawk/dove, ranking |
| — **M1 acceptance** (`07-ACCEPTANCE.md` Scenario A) | done | - | full scoring round anonym+lock+reveal |
| T12 Applications ranking table | done | - | sortable+filter, ranking 6.4, 403 assessor |
| T13 Application detail, decisions, feedback | done | - | identity only here, feedback no private, decision+override audit |
| T14 Programme balance dashboard | done | - | 50/10/15%+small slots, move recomputes 300ms |
| T15 Export | done | - | csv BOM CRLF, 3 scopes, private never, xlsx 400 |
| — **M2 acceptance** (Scenario B) | done | - | ranking/balance/export verified |
| T16 Settings and evaluators | in progress | | API hardened (GET/PUT /api/settings + GET/POST/PATCH /api/evaluators with zod+session+audit) — pages pending sibling |
| T17 Calibration mode | done | - | calibration set -> all evaluators, deviation per criterion, withheld until all submitted (sibling) |
| T18 Audit viewer and hardening | done | - | GET /api/audit (entity/entityId/limit reverse-chron) + app/admin/audit; full hardening pass — see commit checklist |
| — **M3 acceptance** (Scenario C + cross-cutting X1–X7) | done | - | build+tsc+61 tests pass |

## Open questions raised during implementation

Add a row here rather than deciding. The product owner answers these.

| # | Task | Question | Answer |
|---|---|---|---|
| | | | |

## Decisions already settled — do not reopen

- Session length: **50 minutes**, including the host's introduction and close.
- Youth threshold: **under 35**.
- Ethnicity categories: **UK Census** (`ethnicity_options = 'uk_census'`); exact wording
  still under review, but the setting is no longer null.
- IAF bonus: **additive** (0-10 displayed total). The quality standard is still computed
  on the primary 0-8 score only.
- Scoring is **per criterion, holistic** — never per question.
- See `plan/09-CHANGELOG.md` for everything that changed on 2026-08-19 and why.
