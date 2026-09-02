import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit, getClientIpFromRequest } from "@/lib/audit";
import { computeBalance, type BalanceApp, type BalanceSettings } from "@/lib/panel-balance";

function getTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

function parseSettingValue(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    // try JSON parse if looks like JSON
    if ((s.startsWith('"') && s.endsWith('"')) || s === "null" || !isNaN(Number(s))) {
      try {
        return JSON.parse(s);
      } catch {
        return s;
      }
    }
    return s;
  }
  // If it's already an object (neon may parse jsonb)
  return raw;
}

async function requireLead(req: Request) {
  const token = getTokenFromRequest(req);
  if (!token) return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }), evaluator: null as any };
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }), evaluator: null as any };
  }
  const sql = getSql();
  const evalRows = (await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`) as any[];
  if (evalRows.length === 0) {
    return { error: Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 }), evaluator: null as any };
  }
  const evaluator = evalRows[0] as { id: string; name: string; role: string };
  if (evaluator.role !== "lead") {
    return { error: Response.json({ error: "Lead access required", code: "forbidden" }, { status: 403 }), evaluator: null as any };
  }
  return { error: null as Response | null, evaluator, session };
}

function toBalanceSettings(map: Map<string, unknown>): BalanceSettings {
  const targetOutsideRaw = map.get("target_outside_england_wales_pct");
  const targetYouthRaw = map.get("target_youth_pct");
  const youthThresholdRaw = map.get("youth_threshold");
  const smallSlotsRaw = map.get("small_room_slots");
  const ethnicityRaw = map.get("ethnicity_options");

  const targetOutsidePct = targetOutsideRaw != null ? Number(targetOutsideRaw) : 50;
  const targetYouthPct = targetYouthRaw != null ? Number(targetYouthRaw) : 10;
  const youthThreshold = youthThresholdRaw != null ? Number(youthThresholdRaw) : 35;
  const smallRoomSlots = smallSlotsRaw != null ? Number(smallSlotsRaw) : 4;
  let ethnicityOptions: string | null = null;
  if (ethnicityRaw === null || ethnicityRaw === undefined) ethnicityOptions = null;
  else if (typeof ethnicityRaw === "string") {
    const trimmed = ethnicityRaw.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "null") ethnicityOptions = null;
    else ethnicityOptions = trimmed;
  } else {
    // could be number etc - treat as string
    ethnicityOptions = String(ethnicityRaw);
  }
  // Handle JSON string like '"uk_census"' already parsed above becomes 'uk_census'
  // If ethnicityRaw was JSON null, parseSettingValue returns null, so above is null.

  return {
    targetOutsidePct: isNaN(targetOutsidePct) ? 50 : targetOutsidePct,
    targetYouthPct: isNaN(targetYouthPct) ? 10 : targetYouthPct,
    youthThreshold: isNaN(youthThreshold) ? 35 : youthThreshold,
    smallRoomSlots: isNaN(smallRoomSlots) ? 4 : Math.round(smallRoomSlots),
    ethnicityOptions,
  };
}

export async function GET(req: Request) {
  const auth = await requireLead(req);
  if (auth.error) return auth.error;

  const sql = getSql();

  // Load settings
  let settingsMap = new Map<string, unknown>();
  try {
    const rows = (await sql`select key, value from settings`) as any[];
    for (const r of rows) {
      settingsMap.set(r.key, parseSettingValue(r.value));
    }
  } catch {
    // use defaults
  }
  const settings = toBalanceSettings(settingsMap);

  // Load applications with needed columns
  // Explicit column list — no star
  let apps: any[] = [];
  try {
    apps = (await sql`
      select
        id, ref_code, status,
        q24_region, q27_under_35, q11_theme, q8_group_setup,
        q10_delivery_mode, q26_career_stage, q25_ethnicity
      from applications
      order by ref_code asc
    `) as any[];
  } catch (e: any) {
    return Response.json({ error: "Failed to fetch applications", code: "server_error", detail: String(e?.message ?? e) }, { status: 500 });
  }

  // Normalise rows to BalanceApp
  const balanceApps: BalanceApp[] = apps.map((a: any) => ({
    id: a.id,
    ref_code: a.ref_code,
    status: a.status,
    q24_region: a.q24_region ?? null,
    q27_under_35: a.q27_under_35 ?? null,
    q11_theme: a.q11_theme ?? null,
    q8_group_setup: Array.isArray(a.q8_group_setup) ? a.q8_group_setup : a.q8_group_setup ? [String(a.q8_group_setup)] : null,
    q10_delivery_mode: a.q10_delivery_mode ?? null,
    q26_career_stage: a.q26_career_stage ?? null,
    q25_ethnicity: a.q25_ethnicity ?? null,
  }));

  // Categorise columns: Selected = accepted + shortlisted, Reserve = standby, Not selected = rest
  // Include 'reserve' status as well if present (future compat)
  const selected = balanceApps.filter((a) => a.status === "accepted" || a.status === "shortlisted");
  const reserve = balanceApps.filter((a) => a.status === "standby" || a.status === "reserve");
  const notSelected = balanceApps.filter((a) => !selected.includes(a) && !reserve.includes(a));

  // Compute balance for selected set (the programme)
  const balance = computeBalance(selected, settings);

  return Response.json(
    {
      settings,
      balance,
      columns: {
        selected: selected.map((a) => ({ id: a.id, ref_code: a.ref_code, status: a.status, q11_theme: a.q11_theme })),
        reserve: reserve.map((a) => ({ id: a.id, ref_code: a.ref_code, status: a.status, q11_theme: a.q11_theme })),
        notSelected: notSelected.map((a) => ({ id: a.id, ref_code: a.ref_code, status: a.status, q11_theme: a.q11_theme })),
      },
      // Full lightweight apps for client recompute (exclude ethnicity from per-row for non-lead? but lead only here, and counts only rule is for exports/ranking not for panel balance; panel needs per-row for recompute. However spec says ethnicity shown as counts only, never as per-application attribute in ranking view, and excluded from exports except full. For panel API, we can return per-row but client will aggregate. To respect "counts only" we could not expose per-row ethnicity to ranking, but panel is separate. We'll return full apps for panel.)
      applications: balanceApps,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// POST to move application between columns (drag/button)
export async function POST(req: Request) {
  const auth = await requireLead(req);
  if (auth.error) return auth.error;
  const evaluator = auth.evaluator;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }

  const applicationId: string | undefined = body.applicationId ?? body.application_id ?? body.id;
  const to: string | undefined = body.to ?? body.target ?? body.column;

  if (!applicationId || typeof applicationId !== "string") {
    return Response.json({ error: "applicationId required", code: "bad_request" }, { status: 400 });
  }
  if (!to || typeof to !== "string") {
    return Response.json({ error: "to required: selected | reserve | not_selected", code: "bad_request" }, { status: 400 });
  }
  const normTo = to.toLowerCase().replace(/-/g, "_");
  if (!["selected", "reserve", "not_selected", "notselected"].includes(normTo)) {
    return Response.json({ error: "to must be selected | reserve | not_selected", code: "bad_request" }, { status: 400 });
  }
  const col = normTo === "notselected" ? "not_selected" : normTo;

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(applicationId)) {
    return Response.json({ error: "Invalid applicationId", code: "bad_request" }, { status: 400 });
  }

  const sql = getSql();

  // Verify application exists
  const existing = (await sql`select id, status, ref_code from applications where id = ${applicationId} limit 1`) as any[];
  if (existing.length === 0) {
    return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });
  }
  const app = existing[0] as { id: string; status: string; ref_code: string };
  const prevStatus = app.status;

  // Map column -> status
  // selected: accepted, reserve: standby, not_selected: declined
  // But if prev was imported/scoring/scored and moving to not_selected, declined makes sense.
  // Allow moving to selected to set to 'accepted' regardless of previous.
  let newStatus: string;
  if (col === "selected") newStatus = "accepted";
  else if (col === "reserve") newStatus = "standby";
  else newStatus = "declined";

  // If already in target status family, no change (e.g., shortlisted already counts as selected)
  const isAlreadySelected = (prevStatus === "accepted" || prevStatus === "shortlisted") && col === "selected";
  const isAlreadyReserve = (prevStatus === "standby" || prevStatus === "reserve") && col === "reserve";
  const isAlreadyNotSelected = !["accepted", "shortlisted", "standby", "reserve"].includes(prevStatus) && col === "not_selected"
    ? true
    : prevStatus === "declined" && col === "not_selected";
  // Simpler: if mapped status equals prev, no-op
  if (isAlreadySelected || isAlreadyReserve || isAlreadyNotSelected) {
    // Still treat as success
    // Recompute balance to return
    const settingsMap = new Map<string, unknown>();
    try {
      const rows = (await sql`select key, value from settings`) as any[];
      for (const r of rows) settingsMap.set(r.key, parseSettingValue(r.value));
    } catch {}
    const settings = toBalanceSettings(settingsMap);
    const apps = (await sql`select id, ref_code, status, q24_region, q27_under_35, q11_theme, q8_group_setup, q10_delivery_mode, q26_career_stage, q25_ethnicity from applications order by ref_code asc`) as any[];
    const balanceApps: BalanceApp[] = apps.map((a: any) => ({
      id: a.id,
      ref_code: a.ref_code,
      status: a.status,
      q24_region: a.q24_region ?? null,
      q27_under_35: a.q27_under_35 ?? null,
      q11_theme: a.q11_theme ?? null,
      q8_group_setup: Array.isArray(a.q8_group_setup) ? a.q8_group_setup : a.q8_group_setup ? [String(a.q8_group_setup)] : null,
      q10_delivery_mode: a.q10_delivery_mode ?? null,
      q26_career_stage: a.q26_career_stage ?? null,
      q25_ethnicity: a.q25_ethnicity ?? null,
    }));
    const selectedSet = balanceApps.filter((a) => a.status === "accepted" || a.status === "shortlisted");
    const bal = computeBalance(selectedSet, settings);
    return Response.json({ ok: true, applicationId, prevStatus, newStatus: prevStatus, balance: bal, alreadyInPlace: true });
  }

  // Perform update
  try {
    await sql`update applications set status = ${newStatus}, updated_at = now() where id = ${applicationId}`;
  } catch (e: any) {
    return Response.json({ error: "Failed to update status", code: "server_error", detail: String(e?.message ?? e) }, { status: 500 });
  }

  // Audit
  try {
    await writeAudit({
      actorId: evaluator.id,
      actorName: evaluator.name,
      action: "application.move_column",
      entity: "application",
      entityId: applicationId,
      payload: { prevStatus, newStatus, column: col, ref_code: app.ref_code },
      ip: getClientIpFromRequest(req),
    });
    // Also panel_decision-style? Keep simple.
  } catch {
    // audit failure not fatal
  }

  // Recompute balance for new selected set to return (so client can verify)
  let settingsMap2 = new Map<string, unknown>();
  try {
    const rows = (await sql`select key, value from settings`) as any[];
    for (const r of rows) settingsMap2.set(r.key, parseSettingValue(r.value));
  } catch {}
  const settings2 = toBalanceSettings(settingsMap2);
  const apps2 = (await sql`select id, ref_code, status, q24_region, q27_under_35, q11_theme, q8_group_setup, q10_delivery_mode, q26_career_stage, q25_ethnicity from applications order by ref_code asc`) as any[];
  const balanceApps2: BalanceApp[] = apps2.map((a: any) => ({
    id: a.id,
    ref_code: a.ref_code,
    status: a.status,
    q24_region: a.q24_region ?? null,
    q27_under_35: a.q27_under_35 ?? null,
    q11_theme: a.q11_theme ?? null,
    q8_group_setup: Array.isArray(a.q8_group_setup) ? a.q8_group_setup : a.q8_group_setup ? [String(a.q8_group_setup)] : null,
    q10_delivery_mode: a.q10_delivery_mode ?? null,
    q26_career_stage: a.q26_career_stage ?? null,
    q25_ethnicity: a.q25_ethnicity ?? null,
  }));
  const selected2 = balanceApps2.filter((a) => a.status === "accepted" || a.status === "shortlisted");
  const balance2 = computeBalance(selected2, settings2);

  return Response.json({ ok: true, applicationId, prevStatus, newStatus, balance: balance2 });
}
