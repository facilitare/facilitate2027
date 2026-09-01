# Agent Brief — FACILITATE 2027 Session Assessment Tool

**Read this file first. Then read the other files in `plan/` in numerical order.**

You are implementing a complete web application from a finished specification. Every
architectural decision has already been made and is written down. Your job is execution,
not design. If something appears undecided, it is decided in one of these files — search
before inventing.

---

## 1. What you are building

A private web application for a panel of ~6 assessors who score session proposals
submitted to the IAF Europe Region Conference 2027 (#FACILITATE2027). It replaces a
Google Sheets / Excel / Google Docs workflow.

The core loop:

1. An admin imports applications from a Google Forms CSV export.
2. The system anonymises each application and assigns it to 3 of the 6 assessors.
3. Each assessor scores 4 criteria on a 0/1/2 scale and writes two pieces of feedback,
   **without seeing any other assessor's scores until they submit their own**.
4. The system aggregates scores, flags disagreement, and ranks applications.
5. A panel lead reviews the ranking with identities revealed and builds a balanced
   programme against diversity and track targets.

## 2. Non-negotiable rules

These are the rules that make the product correct. Breaking any of them is a defect,
even if the feature "works".

| # | Rule |
|---|------|
| R1 | **Anonymity is enforced on the server.** Round-1 endpoints must never serialise identity fields into the response, not even hidden in the DOM or a JSON payload. See `03-DATA-MODEL.md §4`. |
| R2 | **No score leakage before submission.** An assessor's request for another assessor's scores on application X must return 403 until that assessor has submitted their own assessment of X. |
| R3 | **All scores are integers 0, 1 or 2.** No nulls in a submitted assessment, no half points, no legacy -1/0/1 anywhere in the code or the UI. |
| R4 | **Every mutation is written to `audit_log`.** No exceptions. |
| R5 | **Rubric anchor text is visible on screen while scoring**, not in a tooltip. |
| R6 | **Never modify anything in `/surse`.** Those are source documents. |
| R7 | **No new dependencies** beyond the list in §4 without an explicit instruction. |

## 3. Stack (fixed)

- **Next.js 15**, App Router, TypeScript, React Server Components where natural.
- **API via Route Handlers** (`app/api/**/route.ts`). Do **not** use Server Actions —
  explicit HTTP endpoints are easier to test and audit.
- **Postgres on Neon**, accessed with `@neondatabase/serverless` (HTTP driver — no
  connection pooling problems on Vercel).
- **Plain SQL**, hand-written migrations in `db/migrations/NNN_name.sql`. No ORM.
  A thin typed query layer lives in `lib/db/*.ts`.
- **Tailwind CSS v4** + **shadcn/ui** components.
- **Deployment: Vercel.** Environment variables only, no secrets in the repo.
- **UI language: English.** All user-facing strings in English. Code comments in English.

## 4. Allowed dependencies

```
next react react-dom typescript
tailwindcss @tailwindcss/postcss
@neondatabase/serverless
jose                (signed session cookies)
@node-rs/argon2  OR  bcryptjs   (password hashing — pick bcryptjs if the first fails to build)
papaparse           (CSV parsing)
zod                 (input validation on every route handler)
lucide-react        (icons)
clsx tailwind-merge class-variance-authority   (shadcn peer deps)
@radix-ui/*         (only what shadcn pulls in)
vitest              (unit tests)
```

Nothing else. No chart library — the two charts in the panel dashboard are plain
divs and SVG, specified in `05-DESIGN.md §7`.

## 5. Order of work

Build in three milestones. Do not start a milestone before the previous one passes its
acceptance checks in `07-ACCEPTANCE.md`.

**M1 — Assessors can score (tasks T01–T11).** This is the minimum that lets the panel
stop using the spreadsheet.

**M2 — Leads can decide (tasks T12–T15).** Ranking, decisions, programme balance, export.

**M3 — Operations (tasks T16–T18).** Settings, calibration mode, audit viewer.

## 6. Definition of done for a single task

A task is done when **all** of the following are true. Run them; do not assume.

1. `npm run build` completes with no errors and no new warnings.
2. `npx tsc --noEmit` is clean.
3. `npm test` passes.
4. Every acceptance criterion listed on that task's card in `06-TASKS.md` has been
   manually exercised in the running app and observed to behave as written.
5. The task's changes are committed alone, with the task id in the message
   (e.g. `T07: assignment engine`).

If an acceptance criterion cannot be met, stop and report which one and why. Do not
substitute a different behaviour.

## 7. Seed data

`db/seed.ts` must create: 6 evaluators (fictional names, see `04-SPEC.md §2.3`), one
wave, and 12 synthetic applications with varied content so every screen can be
exercised without real applicant data. Real applicant data must never be committed.

## 8. Files in this package

| File | Contains |
|---|---|
| `00-AGENT-BRIEF.md` | This file. Rules, stack, order. |
| `01-DECIZII.md` | (Romanian) Decisions taken and open questions for the product owner. Context only — do not implement from this file. |
| `02-RUBRIC.md` | The scoring rubric, verbatim. Copy strings from here into the UI. |
| `03-DATA-MODEL.md` | Database schema, CSV column mapping, field visibility classes. |
| `04-SPEC.md` | Functional specification: roles, auth, screens, business rules, API surface. |
| `05-DESIGN.md` | Design tokens and component specs. |
| `06-TASKS.md` | 18 task cards with acceptance criteria. Your working queue. |
| `07-ACCEPTANCE.md` | End-to-end acceptance scenarios per milestone. |
