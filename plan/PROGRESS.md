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
| T04 Design system primitives | todo | | |
| T05 CSV import | todo | | |
| T06 Anonymity layer | todo | | |
| T07 Assignment engine | todo | | |
| T08 Assessor dashboard | todo | | |
| T09 Review screen | todo | | |
| T10 Reveal and compare | todo | | |
| T11 Scoring library | todo | | |
| — **M1 acceptance** (`07-ACCEPTANCE.md` Scenario A) | todo | | |
| T12 Applications ranking table | todo | | |
| T13 Application detail, decisions, feedback | todo | | |
| T14 Programme balance dashboard | todo | | |
| T15 Export | todo | | |
| — **M2 acceptance** (Scenario B) | todo | | |
| T16 Settings and evaluators | todo | | |
| T17 Calibration mode | todo | | |
| T18 Audit viewer and hardening | todo | | |
| — **M3 acceptance** (Scenario C + cross-cutting X1–X7) | todo | | |

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
