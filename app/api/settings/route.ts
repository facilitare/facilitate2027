import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit, getClientIpFromRequest } from "@/lib/audit";

function getToken(req: Request): string | null {
  const c = req.headers.get("cookie");
  if (!c) return null;
  const m = c.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

function parseRaw(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  if (raw === null) return null;
  if (typeof raw === "object") return raw; // neon already parsed jsonb
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s === "" || s.toLowerCase() === "null") return null;
    try {
      // settings values stored as json-encoded: '"uk_census"' , '3' , 'null'
      // JSON.parse handles numbers, strings, null, arrays
      return JSON.parse(s);
    } catch {
      // fallback: raw string not JSON (e.g. plain 'uk_census' without quotes)
      return s;
    }
  }
  return raw;
}

async function requireLead(req: Request) {
  const token = getToken(req);
  if (!token) return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) } as const;
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) } as const;
  }
  const sql = getSql();
  const rows = (await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`) as any[];
  if (rows.length === 0) return { error: Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 }) } as const;
  const evaluator = rows[0] as { id: string; name: string; role: string };
  if (evaluator.role !== "lead") {
    return { error: Response.json({ error: "Lead access required", code: "forbidden" }, { status: 403 }) } as const;
  }
  return { evaluator, session, sql } as const;
}

// Validation schemas per key
const SettingsShape = z.object({
  assessors_per_application: z.number().int().min(1).max(6).optional(),
  session_minutes: z.number().int().min(10).max(300).optional(),
  youth_threshold: z.number().int().min(18).max(100).optional(),
  ethnicity_options: z.union([z.null(), z.literal("uk_census"), z.string(), z.array(z.string())]).optional(),
  small_room_slots: z.number().int().min(0).max(100).optional(),
  iaf_bonus_mode: z.enum(["additive", "tiebreak"]).optional(),
  quality_min_mean_total: z.number().min(0).max(8).optional(),
  quality_min_mean_criterion: z.number().min(0).max(2).optional(),
  target_outside_england_wales_pct: z.number().int().min(0).max(100).optional(),
  target_youth_pct: z.number().int().min(0).max(100).optional(),
  divergence_threshold: z.number().int().min(0).max(8).optional(),
  normalisation_min_submissions: z.number().int().min(1).max(20).optional(),
});

// Defaults matching 03-DATA-MODEL seed
const DEFAULTS: Record<string, unknown> = {
  assessors_per_application: 3,
  session_minutes: 50,
  youth_threshold: 35,
  ethnicity_options: "uk_census",
  small_room_slots: 4,
  iaf_bonus_mode: "additive",
  quality_min_mean_total: 5.0,
  quality_min_mean_criterion: 1.0,
  target_outside_england_wales_pct: 50,
  target_youth_pct: 10,
  divergence_threshold: 2,
  normalisation_min_submissions: 5,
};

const ORDERED_KEYS: string[] = [
  "ethnicity_options", // must appear first per spec 3.11
  "assessors_per_application",
  "iaf_bonus_mode",
  "session_minutes",
  "small_room_slots",
  "youth_threshold",
  "target_outside_england_wales_pct",
  "target_youth_pct",
  "quality_min_mean_total",
  "quality_min_mean_criterion",
  "divergence_threshold",
  "normalisation_min_submissions",
];

export async function GET(req: Request) {
  const auth = await requireLead(req);
  if ("error" in auth) return auth.error;
  const sql = auth.sql;

  let rows: any[] = [];
  try {
    rows = (await sql`select key, value, updated_at, updated_by from settings order by key asc`) as any[];
  } catch (e: any) {
    return Response.json({ error: "Failed to fetch settings", code: "server_error", detail: String(e?.message ?? e) }, { status: 500 });
  }

  const map = new Map<string, { raw: unknown; parsed: unknown; updated_at: string | null; updated_by: string | null }>();
  for (const r of rows) {
    map.set(r.key, { raw: r.value, parsed: parseRaw(r.value), updated_at: r.updated_at, updated_by: r.updated_by });
  }

  // Merge defaults for missing keys (so client sees everything)
  const settings: Record<string, unknown> = {};
  const meta: Record<string, { updated_at: string | null; updated_by: string | null }> = {};
  for (const k of ORDERED_KEYS) {
    if (map.has(k)) {
      settings[k] = map.get(k)!.parsed;
      meta[k] = { updated_at: map.get(k)!.updated_at, updated_by: map.get(k)!.updated_by };
    } else {
      settings[k] = (DEFAULTS as any)[k] ?? null;
      meta[k] = { updated_at: null, updated_by: null };
    }
  }
  // Include any extra keys not in ordered list (forward compat)
  for (const [k, v] of map) {
    if (!(k in settings)) {
      settings[k] = v.parsed;
      meta[k] = { updated_at: v.updated_at, updated_by: v.updated_by };
    }
  }

  return Response.json({ settings, meta, orderedKeys: ORDERED_KEYS, defaults: DEFAULTS }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request) {
  const auth = await requireLead(req);
  if ("error" in auth) return auth.error;
  const { evaluator, sql } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }

  // Accept either { key: value } flat object or { settings: { key: value } }
  const rawObj: Record<string, unknown> =
    body && typeof body === "object" && "settings" in (body as any) && typeof (body as any).settings === "object"
      ? (body as any).settings
      : (body as any);

  if (!rawObj || typeof rawObj !== "object" || Array.isArray(rawObj)) {
    return Response.json({ error: "Body must be object of settings", code: "bad_request" }, { status: 400 });
  }

  // Normalize ethnicity_options: empty string -> null
  if ("ethnicity_options" in rawObj) {
    const v: any = (rawObj as any).ethnicity_options;
    if (v === "" || (typeof v === "string" && v.trim() === "")) (rawObj as any).ethnicity_options = null;
    if (typeof v === "string" && v.trim().toLowerCase() === "null") (rawObj as any).ethnicity_options = null;
  }

  const parsed = SettingsShape.safeParse(rawObj);
  if (!parsed.success) {
    return Response.json({ error: "Invalid settings payload", code: "bad_request", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return Response.json({ error: "No settings keys provided", code: "bad_request" }, { status: 400 });
  }
  // Reject unknown keys
  const allowed = new Set(ORDERED_KEYS);
  for (const k of keys) {
    if (!allowed.has(k)) {
      return Response.json({ error: `Unknown setting key: ${k}`, code: "bad_request" }, { status: 400 });
    }
  }

  // Load old values for audit
  const changes: Array<{ key: string; old: unknown; new: unknown }> = [];
  const results: Record<string, unknown> = {};

  for (const key of keys) {
    const newVal = (data as any)[key];
    // Read old
    let oldParsed: unknown = null;
    let hadRow = false;
    try {
      const rows = (await sql`select value from settings where key = ${key} limit 1`) as any[];
      if (rows.length > 0) {
        hadRow = true;
        oldParsed = parseRaw(rows[0].value);
      } else {
        oldParsed = (DEFAULTS as any)[key] ?? null;
        hadRow = false;
      }
    } catch {
      oldParsed = (DEFAULTS as any)[key] ?? null;
    }

    // Compare JSON stringify for deep equality (handles arrays)
    const oldStr = JSON.stringify(oldParsed);
    const newStr = JSON.stringify(newVal);
    if (oldStr === newStr) {
      results[key] = newVal;
      continue;
    }

    const newJson = JSON.stringify(newVal);
    try {
      if (hadRow) {
        await sql`update settings set value = ${newJson}::jsonb, updated_by = ${evaluator.id}, updated_at = now() where key = ${key}`;
      } else {
        await sql`insert into settings (key, value, updated_by) values (${key}, ${newJson}::jsonb, ${evaluator.id})`;
      }
    } catch (e: any) {
      return Response.json({ error: `Failed to update ${key}`, code: "server_error", detail: String(e?.message ?? e) }, { status: 500 });
    }

    changes.push({ key, old: oldParsed, new: newVal });
    results[key] = newVal;

    // Audit per key with old/new
    try {
      await writeAudit({
        actorId: evaluator.id,
        actorName: evaluator.name,
        action: "settings.update",
        entity: "settings",
        entityId: key,
        payload: { key, old: oldParsed, new: newVal },
        ip: getClientIpFromRequest(req),
      });
    } catch {}
  }

  return Response.json({ ok: true, changed: changes, settings: results });
}
