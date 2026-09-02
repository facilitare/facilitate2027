import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";

export type AutoAssignInput = {
  waveId: string;
  perApplication?: number;
  actorId?: string | null;
  actorName?: string | null;
  ip?: string | null;
};

export type AutoAssignResult = {
  assigned: number;
  skipped: Array<{ id: string; ref_code: string; reason: string }>;
  shortfall: number;
  loads: Array<{ evaluatorId: string; name: string; count: number }>;
  warning?: string;
};

/**
 * Deterministic greedy assignment — no randomness.
 * Flagged applications (anonymity_flag = true) are never auto-assigned.
 * They are reported as skipped with a human-readable reason.
 */
export async function autoAssign(input: AutoAssignInput): Promise<AutoAssignResult> {
  const sql = getSql();
  const { waveId, perApplication } = input;

  // Default perApplication from settings if not supplied
  let perApp = perApplication;
  if (perApp == null) {
    const s = await sql`select value from settings where key = 'assessors_per_application'`;
    const v = (s as any[])[0]?.value;
    perApp = typeof v === "number" ? v : v != null ? Number(v) : 3;
    if (isNaN(perApp as number)) perApp = 3;
  }

  // Fetch applications in wave with status imported (all), ordered by ref_code
  const allApps = await sql`
    select id, ref_code, anonymity_flag, anonymity_notes
    from applications
    where wave_id = ${waveId} and status = 'imported'
    order by ref_code
  `;

  const apps = allApps as any[];
  const skipped: AutoAssignResult["skipped"] = [];
  const eligible: typeof apps = [];

  for (const a of apps) {
    if (a.anonymity_flag === true) {
      const notes = a.anonymity_notes ? ` — ${a.anonymity_notes}` : "";
      skipped.push({
        id: a.id,
        ref_code: a.ref_code,
        reason: `anonymity_flag set${notes} — redact or dismiss flag before assignment`,
      });
    } else {
      eligible.push(a);
    }
  }

  // Active evaluators
  const evalRows = await sql`select id, name from evaluators where active = true order by name`;
  const evaluators = evalRows as any[];
  if (evaluators.length === 0) {
    return { assigned: 0, skipped, shortfall: eligible.length * (perApp as number), loads: [] };
  }

  // Current load per evaluator (all assessments except recused? we count assigned/draft/submitted)
  const loadRows = await sql`
    select evaluator_id, count(*)::int as c
    from assessments
    where evaluator_id in (select id from evaluators where active = true)
    group by evaluator_id
  `;
  const loadMap = new Map<string, number>();
  for (const r of loadRows as any[]) loadMap.set(r.evaluator_id, r.c);
  for (const e of evaluators) if (!loadMap.has(e.id)) loadMap.set(e.id, 0);

  let existingByApp = new Map<string, Set<string>>();
  let recusedByApp = new Map<string, Set<string>>();

  // Fetch all assessments for this wave
  const existingAll = await sql`
    select a.application_id, a.evaluator_id, a.state
    from assessments a
    join applications app on app.id = a.application_id
    where app.wave_id = ${waveId}
  `;
  for (const r of existingAll as any[]) {
    if (!existingByApp.has(r.application_id)) existingByApp.set(r.application_id, new Set());
    existingByApp.get(r.application_id)!.add(r.evaluator_id);
    if (r.state === "recused") {
      if (!recusedByApp.has(r.application_id)) recusedByApp.set(r.application_id, new Set());
      recusedByApp.get(r.application_id)!.add(r.evaluator_id);
    }
  }

  // Sort evaluators by load ascending, then name (deterministic)
  function sortedEvaluators(): typeof evaluators {
    return [...evaluators].sort((a, b) => {
      const la = loadMap.get(a.id) ?? 0;
      const lb = loadMap.get(b.id) ?? 0;
      if (la !== lb) return la - lb;
      return a.name.localeCompare(b.name);
    });
  }

  let assigned = 0;
  let shortfall = 0;

  for (const app of eligible) {
    const already = existingByApp.get(app.id) ?? new Set<string>();
    const recused = recusedByApp.get(app.id) ?? new Set<string>();
    const candidates = sortedEvaluators().filter((e) => !already.has(e.id) && !recused.has(e.id));
    const toAssign = candidates.slice(0, perApp as number);
    if (toAssign.length < (perApp as number)) {
      shortfall += (perApp as number) - toAssign.length;
    }
    for (const ev of toAssign) {
      await sql`insert into assessments (application_id, evaluator_id, state) values (${app.id}, ${ev.id}, 'assigned') on conflict (application_id, evaluator_id) do nothing`;
      loadMap.set(ev.id, (loadMap.get(ev.id) ?? 0) + 1);
      // track that this app now has this evaluator
      if (!existingByApp.has(app.id)) existingByApp.set(app.id, new Set());
      existingByApp.get(app.id)!.add(ev.id);
      assigned++;
    }
    if (toAssign.length > 0) {
      await sql`update applications set status = 'scoring', updated_at = now() where id = ${app.id} and status = 'imported'`;
    }
  }

  // Compute final loads for report
  const loads: AutoAssignResult["loads"] = evaluators.map((e) => ({
    evaluatorId: e.id,
    name: e.name,
    count: loadMap.get(e.id) ?? 0,
  }));

  let warning: string | undefined;
  if (loads.length > 0) {
    const counts = loads.map((l) => l.count);
    const spread = Math.max(...counts) - Math.min(...counts);
    if (spread > 2) warning = `Load spread ${spread} exceeds 2 — consider rebalancing`;
  }

  // Audit
  if (input.actorId) {
    await writeAudit({
      actorId: input.actorId,
      actorName: input.actorName ?? null,
      action: "assignments.auto",
      entity: "wave",
      entityId: waveId,
      payload: { perApplication: perApp, assigned, skipped: skipped.length, shortfall },
      ip: input.ip ?? null,
    });
  }

  return { assigned, skipped, shortfall, loads, warning };
}
