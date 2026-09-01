# Prompts for the implementing agent

Hermes starts each session cold. Use prompt A once, prompt B for every session after that.

---

## Before the first session — product owner's prerequisites

The agent cannot do these; they need accounts and secrets.

1. **Neon database.** Create a project at neon.tech, copy the pooled connection string.
2. **Vercel project.** Create it, link it to the repository (deployment can wait until
   after M1, but creating it early avoids a scramble).
3. **Secrets.** Decide the shared panel password and the lead password. After T01 exists,
   run `npm run hash -- '<password>'` for each and put the results, the connection string
   and a random 32-byte `SESSION_SECRET` into `.env.local` and into Vercel's environment
   variables.

Until step 1 is done, the agent can complete T01 but not T02.

---

## Prompt A — first session

```
You are implementing a web application from a complete specification that already
exists in this repository, in plan/. Every architectural decision has been made and
written down. Your job is execution, not design.

Read plan/00-AGENT-BRIEF.md in full, then the remaining files in plan/ in numerical
order, then plan/PROGRESS.md. plan/01-DECIZII.md is in Romanian and is background for
the product owner — read it for context, but never implement from it; everything
implementable in that file is restated in English in files 02 through 07.

Then work plan/06-TASKS.md from T01 downwards. One task per commit, with the task id as
the commit message prefix. Update plan/PROGRESS.md in the same commit.

Four things that will make or break this:

1. Rules R1-R7 in the brief are not suggestions. R1 (anonymity enforced on the server)
   and R2 (no score leakage before an assessor submits) are the reason this application
   exists. A feature that works but breaks either one is a defect, not a trade-off.

2. Do not decide anything. If something looks undecided, search plan/ — it is decided
   somewhere. If you truly cannot find it, add a row to the "Open questions" table in
   plan/PROGRESS.md and continue with the next task rather than guessing. One setting,
   ethnicity_options, deliberately stays null; do not invent a list of categories for it.

3. A task is done only when you have run its acceptance criteria and observed the stated
   behaviour. plan/00-AGENT-BRIEF.md section 6 defines this. Do not report a task
   complete because the code looks correct.

4. Copy the rubric strings verbatim from plan/02-RUBRIC.md. Assessors calibrate their
   judgement against that exact wording; paraphrasing changes the scores people give.

Do not modify anything in /surse — those are the source documents the specification was
derived from.

Start with T01. When its acceptance criteria pass, report what you ran and what you
observed, then stop and wait.
```

---

## Prompt B — every session after the first

```
Continue implementing this project. Read plan/00-AGENT-BRIEF.md, then plan/PROGRESS.md,
then the task card in plan/06-TASKS.md for the first task that is not marked done, plus
whichever of plan/02 through plan/05 that task references.

Rules R1-R7 in the brief still apply. Do not decide anything that plan/ does not decide —
log it in the Open questions table instead. A task is done only when you have run its
acceptance criteria and observed the behaviour they describe.

Do one task, update plan/PROGRESS.md in the same commit, report what you ran and what you
observed, then stop.
```

---

## How to read the agent's report

After each task, check three things before letting it continue:

- **Did it run the acceptance criteria, or describe them?** "The endpoint returns 403" is
  a claim; "I called it with an unsubmitted assessment and got 403, here is the output" is
  evidence. Ask for the output if it is missing.
- **Did it add anything you did not ask for?** New dependencies, new tables, new screens.
  The brief has a closed dependency list for exactly this reason.
- **Did it silently resolve an ambiguity?** Check the Open questions table. An empty
  table across 18 tasks is more suspicious than a full one.

The two tasks worth reviewing yourself, line by line, are **T06 (anonymity)** and
**T10 (score lock)**. Everything else is recoverable; those two are the product.
