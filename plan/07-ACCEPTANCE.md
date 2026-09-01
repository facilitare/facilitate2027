# Acceptance — end-to-end scenarios

Task-level criteria live in `06-TASKS.md`. These are the whole-system checks. Run them by
hand, in order, against a freshly migrated and seeded database. Record the result of each
numbered step. A milestone is not complete until every step in its scenario passes.

---

## Scenario A — Milestone 1: a full scoring round

1. Migrate and seed. Confirm 6 evaluators, 1 wave, 12 applications.
2. Sign in with the shared password. Choose **Marco Ferretti** (assessor).
3. Confirm the queue is empty and the empty state explains why.
4. Switch to **Ingrid Halvorsen** (lead) using the admin password.
5. Import `db/fixtures/sample-responses.csv` as a dry run. Confirm the report names the
   duplicate, the unmapped value, the malformed enum and the anonymity flag.
6. Confirm nothing was written. Commit the import. Confirm ref codes run `W1-001`
   upwards in submission order.
7. Open the flagged application. Confirm the flag names the field and the reason. Redact
   the offending sentence. Confirm the redaction is audited.
8. Auto-assign at 3 per application. Confirm the load spread is even and that no
   still-flagged application was assigned.
9. Switch to Marco. Confirm the queue now shows his assignments.
10. Open one. Confirm Q17 and Q18 appear neither on screen nor in the network payload
    (check the Network tab, not just the page).
11. Score three criteria, write one feedback field, leave the page. Return. Confirm
    everything was restored.
12. Try to submit. Confirm it is blocked and the message says exactly what is missing.
13. Try to open `/review/<id>/compare` now. Confirm **403**.
14. Complete and submit. Confirm the confirmation screen shows the same scores.
15. Open the compare view. Confirm it is now allowed and that the means match a hand
    calculation.
16. Try to change the submitted assessment via the API. Confirm **409**.
17. As two further assessors, submit deliberately divergent scores on the same
    application. Confirm the divergence flag and the `Disagreement` label appear.
18. Recuse a third assessor from a different application. Confirm it leaves the queue,
    the reason is stored, and re-running auto-assign does not reassign them.
19. Complete the whole flow for one application using **only the keyboard**.
20. Repeat step 14 at 375px viewport width. Confirm no horizontal scroll and that the
    action bar stays reachable.

## Scenario B — Milestone 2: from scores to a programme

1. With Scenario A's data, open `/applications` as a lead. Confirm the ranking order
   matches `04-SPEC.md §6.4`, tiebreaks included, against a hand-sorted list.
2. Confirm the deliberately off-topic seed application is marked `below_standard` even
   though its other criteria score well — the gate rule.
3. Override the quality standard on it. Confirm a reason is required and that the audit
   entry records the previous status.
4. Open an application detail. Confirm identity fields are present here and were absent in
   Scenario A step 10.
5. Copy the aggregated feedback. Paste it into a text editor. Confirm every assessor's two
   fields are present, every no-evidence flag has its own bullet, and no private note
   appears.
6. Shortlist six applications, chosen so the region split is 2 of 6 outside England and
   Wales. Confirm the panel dashboard reports 33% against a 50% target and shows the miss
   state.
7. Swap one application for another and confirm the card updates within a second, without
   a page reload.
8. Confirm the Q25 card reads `Not configured` rather than showing a number.
9. Switch `iaf_bonus_mode` to `additive`. Confirm totals move to a 0–10 scale, the ranking
   changes, and every screen showing a total says which mode is active. Switch back.
10. Export all three scopes. Open each in Google Sheets and in Excel. Confirm the field
    containing a comma, a quote and a newline survives intact, and that the feedback
    export contains no private notes.

## Scenario C — Milestone 3: operations

1. Change `assessors_per_application` to 4. Auto-assign a new wave. Confirm 4 per
   application.
2. Deactivate an evaluator who has submitted assessments. Confirm their scores still count
   in every aggregate and that they no longer receive new assignments.
3. Mark three applications as the calibration set. Confirm all six evaluators are assigned
   to each, regardless of the setting from step 1.
4. Submit as five of six. Confirm the comparison view is withheld and names the one
   outstanding assessor.
5. Submit as the sixth. Confirm each assessor's signed deviation from the panel mean is
   shown per criterion.
6. Open the audit viewer. Confirm it contains an entry for every mutation performed across
   Scenarios A, B and C, each with an actor and a timestamp.

---

## Cross-cutting checks — run before calling the project finished

| # | Check |
|---|---|
| X1 | **Anonymity.** With the browser devtools Network tab open, walk every assessor-facing screen and confirm no identity field appears in any response body. This is the check that matters most; do it last, and do it deliberately. |
| X2 | **Score lock.** Attempt every route that could expose another assessor's scores while your own assessment is unsubmitted. All must return 403. |
| X3 | **Accessibility.** Run axe (or Lighthouse) on `/login`, `/`, `/review/[id]`, `/applications`, `/panel`. Zero critical issues. Then complete Scenario A step 19 with a screen reader active. |
| X4 | **Arithmetic.** Take three applications, compute every aggregate by hand from the raw scores, and compare against every screen that displays them. All must agree. |
| X5 | **Resilience.** Kill the database connection mid-session. Confirm the app shows an error state with a retry rather than a blank page or a stack trace. |
| X6 | **Secrets.** `git log -p` for anything resembling a password, a hash, a connection string or a real applicant's data. The repository must contain none. |
| X7 | **Cold start.** Deploy to a fresh Vercel project with a fresh Neon database using only `.env.example` and `README.md` as instructions. If a step is missing from the README, add it. |

---

## What "finished" means

The panel can run an entire selection wave — import, assign, score anonymously, reveal,
discuss disagreements, rank, balance the programme against the conference targets, record
decisions, and export both the scores and the applicant feedback — without opening a
spreadsheet at any point.
