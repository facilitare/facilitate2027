## 2026-09-01 — aliniere la formularul live (Bogdan + Hermes)

**Sursa:** `surse/IAF Facilitate 2027 Session Application Form.pdf` (print 18.08.2026) + `IAF Facilitate 2027 Session Application Form .csv` (4 rânduri 21-28.08) + `Assessor Assessment.pdf` (01.09.2026).

**Concluzie:** formularul live a deviat de la planul 19.08. Patch aplicat pe `03-DATA-MODEL.md` — schema și mapping rămân compatibile, importul tolerează ambele variante.

| # | Ce s-a schimbat în live | Patch în plan |
|---|---|---|
| 1 | Q7 split în 2: `Outline ... (150w)` + `Session Benefits` | adăugat `q7b_benefits text` (nullable), `ROUND1_FIELDS` include `q7b_benefits` |
| 2 | Q13 `Amount of Participation 1-5` există în PDF dar **lipsește din CSV** | `q13_participation_level` rămâne dar devine nullable; importul nu pică dacă coloana lipsește |
| 3 | Q8 live = `20 in a circle / 40 tables / Between 30-50 / More than 50` vs plan `30-40 circle/tables / Up to 50 / Above 50 / Fully flexible / Needs under 30` | §3.1 acceptă ambele seturi, ne-mapate → `q8_other` |
| 4 | Q9b `tables/chairs` (adăugat 19.08) nu există în live | `q9b_furniture` păstrat nullable forward-compat |
| 5 | Q21 `bio` + Q22 `headshot` lipsesc din CSV (File upload nu iese în CSV) | nullable |
| 6 | Q24 live = `which country you based in` (text liber) vs plan enum region | `q24_region` devine `text` — importul derivă `region` via tabel țări→region (vezi §3.1) |
| 7 | `Username` nu `Email` în CSV header col 1 | mapping `Username → q1_email` |
| 8 | `Before submitting...` e ultima coloană, nu a 2-a | mapping actualizat |
| 9 | `Assessor Assessment.pdf` 01.09 are **doar 1 criteriu (Session Content)** vs plan 4 criterii | **Decizie:** păstrăm 4 criterii din `02-RUBRIC.md` — formularul assessor trebuie refăcut pe 4 criterii; cel de 01.09 e draft incomplet |

**Rămâne deschis:** alinierea Q8 la setul reframed (decizie Helene) și repararea tipului Q13 în Google Forms ca să iasă în CSV.

---

# Changelog

## 2026-08-19 — selection team report-back (Helene, Christine)

### Confirmed, no change needed

- **0/1/2 scale, three points only.** Agreed and being written into the policy document.
  The stated reason is worth keeping on record: wider scales add subjectivity without
  adding information — *"Helen gives 8 because she's nicer than Christine who gives 7, but
  they mean the same thing."* This is also the argument against ever adding a 0–10 slider.
- **Holistic scoring per criterion, not per question.** The plan already groups the
  application by criterion and scores once per section. Now stated explicitly in
  `04-SPEC.md §3.4` so nobody "improves" it into per-question scoring later.
- **Four primary criteria from the policy document.** Unchanged.
- **Credibility focuses on large groups and non-English-speaking groups.** Unchanged.
- **Scotland/Ireland as a separate region category.** Already in the `q24_region` enum.
- **Personal characteristics are for diversity monitoring only, never for threshold
  scoring.** This is exactly the round-1 / round-2 split the plan enforces on the server.

### Changed

| # | Change | Where |
|---|---|---|
| 1 | **IAF bonus is additive, not a tiebreak.** The team treats it as a scored column: 0 non-member, 1 member, 2 member + accreditation. Default flipped to `additive`; displayed total becomes 0–10. | `02-RUBRIC.md §2`, `04-SPEC.md §6.4`, settings seed |
| 2 | **The quality standard is computed on the four criteria only (0–8)**, in both bonus modes. IAF standing can raise a rank; it can never lift an application over the quality bar. | `02-RUBRIC.md §5` |
| 3 | **Q8 group-size options reframed** to `30-40 in a circle / 30-40 around tables / Up to 50 / Above 50 / Fully flexible / Needs to be under 30`. Sub-30 sessions are a scarce resource counted against `small_room_slots`. | `03-DATA-MODEL.md §3.1`, `04-SPEC.md §3.8` |
| 4 | **New question: tables and chairs requirement** (`q9b_furniture`), flagged as critical venue logistics. | `03-DATA-MODEL.md §2, §3` |
| 5 | **Q25 ethnicity resolved: UK Census categories.** `ethnicity_options` moves from `null` to `"uk_census"`. Exact wording still under review by Christine, with input from Bianca. | settings seed, `04-SPEC.md §3.8` |
| 6 | **Import tolerates a moving form.** Q8 and Q9b wording is not final, so header matching is a case-insensitive substring on the first 40 characters, with unmatched headers reported rather than fatal. | `03-DATA-MODEL.md §3.1` |

### New context that shapes the build

- **Volume: 32 applications in the first tranche, aiming to confirm ~24 hosts.** At 3
  assessors per application that is 96 assessments, 16 per assessor. The 3-of-6 assignment
  model holds comfortably; all-6-score-everything would be 32 each and is unnecessary.
- **Venue capped around 200 across 4 tracks**, so sessions average 30–50 people. Most
  proposals should target the larger end; the balance dashboard should make an
  over-supply of small sessions visible early.
- **Tracks are themes, not rooms.** No room assignment in this tool — confirmed out of
  scope.
- **Timeline: the call for session hosts goes out before end of September 2026**, tickets
  in September (visa lead times). Assessment therefore lands roughly October–November
  2026. That is the real deadline for Milestone 1.
- **Under-35 IAF membership promotion** is being verified. It reinforces under-35 as the
  threshold the programme actually reports on.

### Open — carried forward

- Exact wording of the Q25 ethnicity categories (Christine, with Bianca).
- Number of rooms that can host a sub-30 session (`small_room_slots`, currently 4).
- Whether the form ends up in Cvent or stays in Google Forms — see below. Either way the
  import is a CSV; if Cvent's export has different headers, only the mapping table in
  `03-DATA-MODEL.md §3` changes.

---

## The Cvent question

Helene's read is reasonable: Cvent has session and abstract management, and event
platforms in that class generally include a reviewer scoring step. The overlap is real,
and building something a licensed platform already does would be waste.

But nobody on the team has used that module yet — Christine is not yet onboarded, Jocelyn
came back from holiday the same day. So "it probably does this" is currently a hypothesis,
not a finding. Before the selection process is committed to it, someone should put these
questions to Jocelyn. Each one is a place where a generic reviewer module and this
process diverge.

**Blind review**
1. Can reviewers be shown a submission with the submitter's identity hidden, while an
   administrator still sees it? Is that per-field, or all-or-nothing?
2. The applicant's own free text will contain their name and company. Can an administrator
   edit or redact a submitted response before reviewers see it, without destroying the
   original?

**Anchoring**
3. Can a reviewer be prevented from seeing other reviewers' scores until they submit their
   own? This is the single behaviour that a shared spreadsheet cannot provide, and it is
   the reason the tool was proposed.

**The rubric**
4. Can a 0/1/2 scale carry a written anchor for each point, displayed on the scoring
   screen rather than in a help link?
5. Can one score cover several form questions read together, or does it score
   question-by-question? The team explicitly decided on holistic, per-criterion scoring.

**After the scores**
6. Can it flag where reviewers disagree, or is that a manual read of a report?
7. Can it report the selected set against the conference's own targets — 50% of lead hosts
   from outside England and Wales, 10% under 35, four-track balance, a limited number of
   sub-30 rooms — and update live while the panel swaps sessions in and out? This is the
   most bespoke requirement and the least likely to exist off the shelf.
8. Can it assemble each applicant's feedback from several reviewers into one message?

**Access**
9. **There are up to 5 Cvent logins, and the assessment team is around 6 people.** Do
   reviewers need a full login, or is there a separate reviewer role that does not consume
   one? If reviewers consume logins, the platform cannot host this process as currently
   staffed.

**Timing**
10. Christine needs an onboarding session plus 2–3 hours of self-directed learning before
    anyone can answer questions 1–9 from experience. Does that fit before the call for
    session hosts goes out at the end of September?

If the answers to 1, 3 and 9 are all yes, Cvent should carry the process and this plan
should be archived rather than built. If any of them is no, the gap is specific and worth
naming to the committee.
