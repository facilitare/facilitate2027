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
async function requireLead(req: Request) {
  const token = getToken(req);
  if (!token) return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) } as const;
  const payload = await verifySession(token!);
  if (!payload || !payload.authed || !payload.evaluatorId) return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) } as const;
  const sql = getSql();
  const rows = (await sql`select id, name, role from evaluators where id = ${payload.evaluatorId} and active = true`) as any[];
  if (rows.length === 0) return { error: Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 }) } as const;
  const evaluator = rows[0] as { id: string; name: string; role: string };
  if (evaluator.role !== "lead") return { error: Response.json({ error: "Lead access required", code: "forbidden" }, { status: 403 }) } as const;
  return { evaluator, sql } as const;
}

const PatchBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.union([z.string().trim().email(), z.literal(""), z.null()]).optional(),
  role: z.enum(["assessor", "lead"]).optional(),
  active: z.boolean().optional(),
});
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });
  const sql = getSql();
  const rows = (await sql`select id, name, email, role, active, created_at from evaluators where id = ${id} limit 1`) as any[];
  if (!rows.length) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  // Only lead can see inactive detail? but allow any authed to see active; lead can see inactive
  return Response.json(rows[0], { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });
  const auth = await requireLead(req);
  if ("error" in auth) return auth.error;
  const { evaluator, sql } = auth;
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 }); }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid payload", code: "bad_request", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  if (Object.keys(data).length === 0) return Response.json({ error: "No fields to update", code: "bad_request" }, { status: 400 });

  const existingRows = (await sql`select id, name, email, role, active from evaluators where id = ${id} limit 1`) as any[];
  if (!existingRows.length) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  const existing = existingRows[0] as any;

  let emailToCheck: string | null | undefined = undefined;
  const updates: Record<string, unknown> = {};
  if (data.name !== undefined) updates.name = data.name.trim();
  if (data.email !== undefined) {
    const trimmed = data.email && String(data.email).trim() !== "" ? String(data.email).trim() : null;
    updates.email = trimmed;
    emailToCheck = trimmed;
  }
  if (data.role !== undefined) updates.role = data.role;
  if (data.active !== undefined) updates.active = data.active;

  if (emailToCheck !== undefined && emailToCheck !== null) {
    const dup = (await sql`select id from evaluators where email = ${emailToCheck} and id != ${id} limit 1`) as any[];
    if (dup.length) return Response.json({ error: "Email already in use", code: "conflict" }, { status: 409 });
  }
  if (updates.active === false && existing.role === "lead") {
    const leadCount = (await sql`select count(*)::int as c from evaluators where role = 'lead' and active = true and id != ${id}`) as any[];
    if (leadCount[0].c === 0) return Response.json({ error: "Cannot deactivate the last active lead", code: "bad_request" }, { status: 400 });
  }

  const auditPayload: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(updates)) {
    if (JSON.stringify((existing as any)[k]) !== JSON.stringify((updates as any)[k])) {
      auditPayload[k] = { from: (existing as any)[k], to: (updates as any)[k] };
    }
  }

  try {
    if (updates.name !== undefined) await sql`update evaluators set name = ${updates.name as string} where id = ${id}`;
    if (updates.email !== undefined) await sql`update evaluators set email = ${updates.email as string | null} where id = ${id}`;
    if (updates.role !== undefined) await sql`update evaluators set role = ${updates.role as string} where id = ${id}`;
    if (updates.active !== undefined) await sql`update evaluators set active = ${updates.active as boolean} where id = ${id}`;
  } catch (e: any) {
    return Response.json({ error: "Failed to update evaluator", code: "server_error", detail: String(e?.message ?? e) }, { status: 500 });
  }

  const updated = (await sql`select id, name, email, role, active, created_at from evaluators where id = ${id} limit 1`) as any[];
  const action = updates.active === false ? "evaluator.deactivate" : updates.active === true ? "evaluator.reactivate" : "evaluator.update";
  try {
    await writeAudit({
      actorId: evaluator.id,
      actorName: evaluator.name,
      action,
      entity: "evaluator",
      entityId: id,
      payload: { changes: auditPayload, after: { name: updated[0].name, email: updated[0].email, role: updated[0].role, active: updated[0].active } },
      ip: getClientIpFromRequest(req),
    });
  } catch {}
  return Response.json(updated[0]);
}

export async function DELETE() {
  return Response.json({ error: "Evaluators cannot be deleted — deactivate instead (set active=false)", code: "bad_request" }, { status: 400 });
}
