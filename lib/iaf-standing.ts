/**
 * IAF standing from the two form answers (member? + accreditation text).
 * 2 = member with an IAF accreditation (EF / CPF / CPFM), 1 = member without one
 * (including the "non-IAF accreditation" / "none of these" options), 0 = not a member,
 * null = member question unanswered.
 */
export function deriveIafStandingFromForm(q17: string | null, q18: string | null): 0 | 1 | 2 | null {
  if (q17 === "yes") {
    const low = (q18 ?? "").toLowerCase();
    // "non iaf" / "non-iaf" / "none" explicitly mean no IAF accreditation, whatever else the text says
    if (/\bnon[\s-]*iaf\b|\bnone\b/.test(low)) return 1;
    return /certified|\bcpf\b|endorsed|master/.test(low) ? 2 : 1;
  }
  return q17 ? 0 : null;
}
