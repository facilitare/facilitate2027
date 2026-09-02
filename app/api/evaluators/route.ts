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

async function getSession(req: Request) {
  const token = getToken(req);
  if (!token) return null;
  const payload = await verifySession(token);
  return payload;
}

async function requireLead(req: Request) {
  const payload = await getSession(req);
  if (!payload || !payload.authed || !payload.evaluatorId) {
    return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) } as const;
  }
  const sql = getSql();
  const rows = (await sql`select id, name, role from evaluators where id = ${payload.evaluatorId} and active = true`) as any[];
  if (rows.length === 0) return { error: Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 }) } as const;
  const evaluator = rows[0] as { id: string; name: string; role: string };
  if (evaluator.role !== "lead") {
    return { error: Response.json({ error: "Lead access required", code: "forbidden" }, { status: 403 }) } as const;
  }
  return { evaluator, sql } as const;
}

const CreateBody = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  role: z.enum(["assessor", "lead"]).default("assessor"),
  active: z.boolean().optional(),
});

const PatchBody = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.union([z.string().trim().email(), z.literal(""), z.null()]).optional(),
  role: z.enum(["assessor", "lead"]).optional(),
  active: z.boolean().optional(),
});

export async function GET(req: Request) {
  const sql = getSql();
  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "true" || url.searchParams.get("all") === "true";

  // Public for /who flow: if no lead session, just return active
  const payload = await getSession(req);
  let isLead = false;
  if (payload?.evaluatorId) {
    try {
      const rows = (await sql`select role from evaluators where id = ${payload.evaluatorId} and active = true`) as any[];
      if (rows.length && rows[0].role === "lead") isLead = true;
    } catch {}
  }

  // For leads with includeInactive=true, return all. Otherwise active only.
  // Also if no query but caller is lead and wants all via page, page will pass ?includeInactive=true
  let rows: any[];
  if (isLead && includeInactive) {
    rows = (await sql`select id, name, email, role, active, created_at from evaluators order by active desc, name asc`) as any[];
  } else {
    rows = (await sql`select id, name, email, role, active from evaluators where active = true order by name asc`) as any[];
    // For non-lead, active only regardless of param
    if (!isLead && includeInactive) {
      rows = (await sql`select id, name, email, role, active from evaluators where active = true order by name asc`) as any[];
    }
  }
  return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const auth = await requireLead(req);
  if ("error" in auth) return auth.error;
  const { evaluator, sql } = auth;

  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 }); }

  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload", code: "bad_request", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;
  const emailRaw = data.email?.trim() ? data.email.trim() : null;

  // Unique email check
  if (emailRaw) {
    const existing = (await sql`select id from evaluators where email = ${emailRaw} limit 1`) as any[];
    if (existing.length) return Response.json({ error: "Email already in use", code: "conflict" }, { status: 409 });
  }

  let inserted: any[];
  try {
    inserted = (await sql`insert into evaluators (name, email, role, active) values (${data.name.trim()}, ${emailRaw}, ${data.role}, ${data.active ?? true}) returning id, name, email, role, active, created_at`) as any[];
  } catch (e: any) {
    return Response.json({ error: "Failed to create evaluator", code: "server_error", detail: String(e?.message ?? e) }, { status: 500 });
  }
  const row = inserted[0];

  try {
    await writeAudit({
      actorId: evaluator.id,
      actorName: evaluator.name,
      action: "evaluator.create",
      entity: "evaluator",
      entityId: row.id,
      payload: { name: row.name, email: row.email, role: row.role },
      ip: getClientIpFromRequest(req),
    });
  } catch {}

  return Response.json(row, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await requireLead(req);
  if ("error" in auth) return auth.error;
  const { evaluator, sql } = auth;

  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 }); }

  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Invalid payload", code: "bad_request", details: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const existingRows = (await sql`select id, name, email, role, active from evaluators where id = ${data.id} limit 1`) as any[];
  if (existingRows.length === 0) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  const existing = existingRows[0] as { id: string; name: string; email: string | null; role: string; active: boolean };

  const updates: Record<string, unknown> = {};
  let emailToCheck: string | null | undefined = undefined;
  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.email !== undefined) {
    const trimmed = data.email && data.email.trim() !== "" ? data.email.trim() : null;
    updates.email = trimmed;
    emailToCheck = trimmed;
  }
  if (data.role !== undefined) updates.role = data.role;
  if (data.active !== undefined) updates.active = data.active;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No fields to update", code: "bad_request" }, { status: 400 });
  }

  // Email uniqueness if changing
  if (emailToCheck !== undefined && emailToCheck !== null) {
    const dup = (await sql`select id from evaluators where email = ${emailToCheck} and id != ${data.id} limit 1`) as any[];
    if (dup.length) return Response.json({ error: "Email already in use", code: "conflict" }, { status: 409 });
  }

  // Prevent deactivating the actor themselves? Allow but warn — not forbidden. Just allow.
  // Also ensure at least one active lead remains if deactivating a lead
  if (updates.active === false && existing.role === "lead") {
    const leadCount = (await sql`select count(*)::int as c from evaluators where role = 'lead' and active = true and id != ${data.id}`) as any[];
    if (leadCount[0].c === 0) {
      return Response.json({ error: "Cannot deactivate the last active lead", code: "bad_request" }, { status: 400 });
    }
  }

  // Build audit payload old/new
  const auditPayload: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(updates)) {
    const oldVal = (existing as any)[k];
    const newVal = (updates as any)[k];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      auditPayload[k] = { from: oldVal, to: newVal };
    }
  }

  // Perform update — use separate statements per field type to avoid dynamic SQL complexity
  try {
    if (updates.name !== undefined) await sql`update evaluators set name = ${updates.name as string} where id = ${data.id}`;
    if (updates.email !== undefined) await sql`update evaluators set email = ${updates.email as string | null} where id = ${data.id}`;
    if (updates.role !== undefined) await sql`update evaluators set role = ${updates.role as string} where id = ${data.id}`;
    if (updates.active !== undefined) await sql`update evaluators set active = ${updates.active as boolean} where id = ${data.id}`;
  } catch (e: any) {
    return Response.json({ error: "Failed to update evaluator", code: "server_error", detail: String(e?.message ?? e) }, { status: 500 });
  }

  const updatedRows = (await sql`select id, name, email, role, active, created_at from evaluators where id = ${data.id} limit 1`) as any[];
  const updated = updatedRows[0];

  const action = updates.active === false ? "evaluator.deactivate" : updates.active === true ? "evaluator.reactivate" : "evaluator.update";
  try {
    await writeAudit({
      actorId: evaluator.id,
      actorName: evaluator.name,
      action,
      entity: "evaluator",
      entityId: data.id,
      payload: { changes: auditPayload, after: { name: updated.name, email: updated.email, role: updated.role, active: updated.active } },
      ip: getClientIpFromRequest(req),
    });
  } catch {}

  return Response.json(updated);
}

export async function DELETE() {
  return Response.json({ error: "Evaluators cannot be deleted — deactivate instead (set active=false)", code: "bad_request" }, { status: 400 });
}
