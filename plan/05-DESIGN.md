# Design System

The people using this tool read long prose and make repeated judgements for hours. The
design goal is not "modern dashboard" — it is **low fatigue, high confidence**. Two
principles drive every decision below:

1. **The applicant's words are the content; the tool is the frame.** Applicant prose gets
   a serif face, generous size and a measured line length. Tool chrome gets a sans face,
   smaller and quieter. An assessor should never have to work out which is which.
2. **The rubric is on screen, not in memory.** Anchor text is printed inside the score
   options. This is the single biggest usability difference from the spreadsheet.

Implement these tokens verbatim. Do not substitute a component library theme.

---

## 1. Colour

Warm neutrals, not blue-grey — the palette should feel like paper, not like an admin
console. One accent, used sparingly.

```css
/* app/globals.css */
@import "tailwindcss";

:root {
  /* surfaces */
  --bg:            #FBF9F6;   /* page */
  --surface:       #FFFFFF;   /* cards */
  --surface-sunk:  #F4F1EC;   /* wells, code, quoted applicant text */
  --border:        #E5DFD6;
  --border-strong: #CFC6B8;

  /* text */
  --text:          #1C1917;   /* 15.9:1 on --bg */
  --text-muted:    #6B6459;   /* 5.4:1  on --bg  */
  --text-faint:    #9A9187;   /* labels only, never body text */

  /* accent — deep teal */
  --accent:        #0E6B62;
  --accent-hover:  #0B5851;
  --accent-soft:   #E3F0EE;
  --accent-text:   #FFFFFF;

  /* score semantics — muted, never alarming */
  --score-0:       #A8492F;   /* clay  */
  --score-0-soft:  #FBEAE4;
  --score-1:       #6B6459;   /* neutral: meeting the standard is not a failure */
  --score-1-soft:  #F1EEE9;
  --score-2:       #2F6B45;   /* green */
  --score-2-soft:  #E6F1E9;

  /* status */
  --warn:          #9A6410;
  --warn-soft:     #FDF2DF;
  --danger:        #A8322A;
  --danger-soft:   #FBE9E7;

  /* theme badges — the conference 4 Cs */
  --craft:     #7A4F9E;
  --clarity:   #1B6E9E;
  --change:    #B0722A;
  --challenge: #A8492F;

  --radius:     10px;
  --radius-lg:  14px;
  --shadow-sm:  0 1px 2px rgb(28 25 23 / 0.06);
  --shadow-md:  0 4px 16px -4px rgb(28 25 23 / 0.10);
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:            #171614;
    --surface:       #201E1B;
    --surface-sunk:  #2A2724;
    --border:        #35312C;
    --border-strong: #4A443D;
    --text:          #F2EFEA;
    --text-muted:    #A8A096;
    --text-faint:    #7A736A;
    --accent:        #4FB3A5;
    --accent-hover:  #6AC4B7;
    --accent-soft:   #14332F;
    --accent-text:   #0C1F1D;
    --score-0:       #E08A70;  --score-0-soft: #3A211A;
    --score-1:       #A8A096;  --score-1-soft: #2A2724;
    --score-2:       #7CC095;  --score-2-soft: #1B2F22;
    --warn:          #E0B268;  --warn-soft:   #33270F;
    --danger:        #E08A82;  --danger-soft: #331A17;
  }
}
```

A `[data-theme]` toggle in the header switches light/dark explicitly; the default follows
the system. Mirror every dark override under `:root[data-theme="dark"]` so the toggle wins
in both directions.

**Colour is never the only signal.** Divergence also carries a label, `no evidence` also
carries an icon, score 0/1/2 always carries its number and word.

---

## 2. Type

```css
:root {
  --font-sans:  "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-serif: "Source Serif 4", ui-serif, Georgia, "Times New Roman", serif;
}
```

Load from Google Fonts with `display=swap`. Both stacks must degrade to the system
fallbacks without layout shift beyond a small size adjustment.

| Use | Face | Size / line-height | Weight |
|---|---|---|---|
| Page title | sans | 24px / 1.25 | 600 |
| Section heading | sans | 15px / 1.4, letter-spacing .04em, uppercase | 600 |
| **Applicant prose** (Q6, Q7, Q9, Q12, Q15, Q16, Q19) | **serif** | **18px / 1.65** | 400 |
| Applicant prose, mobile | serif | 17px / 1.6 | 400 |
| Tool body / labels | sans | 14px / 1.5 | 400–500 |
| Rubric anchor text | sans | 13px / 1.45 | 400 |
| Table numbers | sans, `font-variant-numeric: tabular-nums` | 14px | 500 |
| Micro / timestamps | sans | 12px / 1.4 | 400 |

Applicant prose is capped at **68ch**. Nothing in the left column exceeds it.

---

## 3. Spacing and layout

4px base scale: 4, 8, 12, 16, 24, 32, 48, 64.

- App shell: fixed header 56px, content below, no global footer.
- Page max width 1440px, side padding 24px (16px under 640px).
- Review screen grid: `minmax(0,1.15fr) minmax(420px,0.85fr)`, gap 32px, collapsing to one
  column below 1024px.
- Card padding: 20px (24px for the review panel).
- Vertical rhythm between application sections: 40px, with a hairline rule and the
  criterion name — the reader should feel each section as a separate act of judgement.

---

## 4. The score control

The most important component in the product. Get this right before anything else.

```
┌──────────────────────────────────────────────────────────┐
│ 0   Below standard                                       │
│     Session is oriented towards training, coaching, or   │
│     a topic outside facilitation. Any overlap with       │
│     facilitation is incidental.                          │
├──────────────────────────────────────────────────────────┤
│ 1   Meets standard                                    ✓  │  ← selected
│     Session is oriented towards facilitation skills,     │
│     practice or experience.                              │
├──────────────────────────────────────────────────────────┤
│ 2   Above standard                                       │
│     Session clearly develops facilitation-specific       │
│     skills and expertise, or develops personal           │
│     facilitation practice or business.                   │
└──────────────────────────────────────────────────────────┘
☐ No evidence provided in the application
```

- A `radiogroup` of three stacked cards, full width. Not a segmented pill — the anchor
  text needs room, and stacking makes the three options equally weighted visually.
- Number: 20px, weight 600, `tabular-nums`, in its own 32px gutter.
- Resting: `--surface`, 1px `--border`. Hover: `--border-strong`.
- Selected: 1.5px border and background in the matching `--score-N-soft`, number in
  `--score-N`, plus a check glyph. **The whole card is the hit target**, min height 64px.
- Focus: 2px `--accent` outline with 2px offset. Visible on keyboard focus only
  (`:focus-visible`).
- Roving tabindex; `ArrowUp`/`ArrowDown` move within the group; `1`/`2`/`3` set directly.
- With `no_evidence` ticked: score forced to 0, cards get `aria-disabled`, opacity .55,
  and a one-line explanation appears — never leave a disabled control unexplained.

---

## 5. Other components

**Chips** (multi-select answers, methods, group sizes): 12px sans, 6px/10px padding,
999px radius, `--surface-sunk` background, `--border` hairline. Never interactive on the
review screen — they are data, and a chip that looks clickable but is not costs trust.

**Theme badge**: pill with the theme colour at 12% opacity as background, the colour at
full strength as text, uppercase 11px, letter-spacing .06em.

**Participation meter** (Q13): five 8px-tall segments, filled ones in `--accent`, above a
caption `Self-reported by the applicant`. Never styled like a score — it is applicant
data, not panel judgement.

**Progress ring**: 44px SVG, 4px stroke, `--accent` on `--border`, percentage inside in
12px tabular figures.

**Divergence indicator**: a 2px left border in `--warn` on the affected matrix row, plus
the word `Disagreement` in `--warn`, plus an `aria-label`. Never colour alone.

**Sticky action bar**: `--surface` with a top hairline and `--shadow-md` inverted upward;
`position: sticky; bottom: 0`. Contains the primary button, the secondary actions, and the
live total. Always visible — a scored form where the submit button has scrolled away is
the classic reason people think they saved when they did not.

**Buttons**: primary `--accent` / `--accent-text`, 40px high, radius 8px, 14px weight 500.
Secondary: transparent with `--border-strong`. Destructive: `--danger` text on
`--danger-soft`. Every button that triggers a network call shows an inline spinner in
place of its label and is disabled while in flight — no double submissions.

**Toasts**: bottom-right, `--surface` with a coloured left border, auto-dismiss after 4s
except errors, which stay until dismissed.

---

## 6. Motion

150ms `cubic-bezier(.2,0,0,1)` for colour and border changes; 200ms for entrances.
No slide-in panels, no page transitions, no animated numbers. Wrap all of it in
`@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }`.

---

## 7. The two charts on `/panel` — plain markup, no library

**Target bar**: a 8px-tall `--surface-sunk` track with a fill; the fill is `--score-2`
when the target is met and `--warn` when it is not. A 2px vertical marker sits at the
target percentage. Label above: `Outside England and Wales — 7 of 14 (50%) · target 50%`.

**Theme distribution**: four stacked horizontal bars, one per theme, each in its theme
colour, with the count and percentage as trailing text. A dotted line marks the 15% floor.

Both are `<div>`s with inline widths, plus a visually hidden `<table>` carrying the same
numbers for screen readers.

---

## 8. Accessibility — required, not optional

- WCAG **AA** contrast for all text and all UI borders. The palette above is built to meet
  it; verify after any change.
- Every interactive element reachable and operable by keyboard, in a sensible order.
- The review screen's two columns are separate landmarks (`<main>` and
  `<aside aria-label="Scoring">`) so a screen-reader user can move between them.
- Autosave status uses `aria-live="polite"`; validation errors use `aria-live="assertive"`
  and are tied to the field with `aria-describedby`.
- Skip link to the scoring panel as the first focusable element on the review screen.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Minimum touch target 44×44px.

---

## 9. Copy tone

Plain, warm, second person, no exclamation marks, no product-speak. The audience is
professional facilitators — they notice how a tool talks to them.

| Instead of | Write |
|---|---|
| "Submission successful!" | "Assessment submitted." |
| "You must fill all required fields" | "Score all four criteria and write both pieces of feedback before submitting." |
| "No data" | "No applications yet. Import a CSV export from the application form to get started." |
| "Are you sure?" | "Submitting is final. A panel lead can reopen your assessment if you need to change it." |
