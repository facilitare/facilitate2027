import { z } from "zod";
import { verifySession, getClientIp } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";

function getToken(req: Request): string | null {
  const c = req.headers.get("cookie");
  if (!c) return null;
  const m = c.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

async function requireAuth(req: Request) {
  const token = getToken(req);
  if (!token) return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) as Response };
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) as Response };
  }
  const sql = getSql();
  const rows = (await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`) as any[];
  if (rows.length === 0) return { error: Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 }) as Response };
  return { evaluator: rows[0] as { id: string; name: string; role: string }, sql };
}

async function requireLead(req: Request) {
  const a = await requireAuth(req);
  if ("error" in a) return a;
  const { evaluator } = a as { evaluator: { id: string; name: string; role: string } };
  if ((evaluator as any).role !== "lead") {
    return { error: Response.json({ error: "Only leads can manage evaluators", code: "forbidden" }, { status: 403 }) as Response };
  }
  return a;
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if ("error" in auth) return auth.error;
  const { sql } = auth as any;
  const rows = (await sql`select id, name, email, role, active from evaluators order by name asc`) as any[];
  return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
}

const PostBody = z.object({
  name: z.string().trim().min(1, "Name required").max(200),
  email: z.string().trim().email("Valid email required").max(200),
  role: z.enum(["assessor", "lead"]).default("assessor"),
});

export async function POST(req: Request) {
  const auth = await requireLead(req);
  if ("error" in auth) return auth.error;
  const { evaluator, sql } = auth as { evaluator: { id: string; name: string; role: string }; sql: any };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = PostBody.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.errors[0]?.message ?? "Invalid request", code: "bad_request" }, { status: 400 });

  const { name, email, role } = parsed.data;
  const existing = (await sql`select id from evaluators where lower(email) = lower(${email}) limit 1`) as any[];
  if (existing.length > 0) return Response.json({ error: "Email already exists", code: "conflict" }, { status: 409 });

  const inserted = (await sql`insert into evaluators (name, email, role, active) values (${name}, ${email}, ${role}, true) returning id, name, email, role, active`) as any[];
  const created = inserted[0];

  const ip = getClientIp(req);
  await writeAudit({
    actorId: evaluator.id,
    actorName: evaluator.name,
    action: "evaluator.create",
    entity: "evaluator",
    entityId: created.id,
    payload: { name, email, role },
    ip,
  });

  return Response.json(created, { status: 201 });
}

// PATCH /api/evaluators? Support body { id, active?, name?, email?, role? }
const PatchBody = z
  .object({
    id: z.string().uuid("Valid evaluator id required"),
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(200).optional(),
    role: z.enum(["assessor", "lead"]).optional(),
    active: z.boolean().optional(),
  })
  .refine((o) => o.name !== undefined || o.email !== undefined || o.role !== undefined || o.active !== undefined, {
    message: "At least one field to update is required",
  });

export async function PATCH(req: Request) {
  const auth = await requireLead(req);
  if ("error" in auth) return auth.error;
  const { evaluator, sql } = auth as { evaluator: { id: string; name: string; role: string }; sql: any };

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.errors[0]?.message ?? "Invalid request", code: "bad_request" }, { status: 400 });

  const { id, name, email, role, active } = parsed.data;
  const existingRows = (await sql`select id, name, email, role, active from evaluators where id = ${id} limit 1`) as any[];
  if (existingRows.length === 0) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  const old = existingRows[0];

  // Prevent deactivating the last lead? Not enforced, just audit
  if (email && email.toLowerCase() !== old.email.toLowerCase()) {
    const dup = (await sql`select id from evaluators where lower(email) = lower(${email}) and id != ${id} limit 1`) as any[];
    if (dup.length > 0) return Response.json({ error: "Email already exists", code: "conflict" }, { status: 409 });
  }

  // Build update — explicit columns, no star
  if (name !== undefined) await sql`update evaluators set name = ${name} where id = ${id}`;
  if (email !== undefined) await sql`update evaluators set email = ${email} where id = ${id}`;
  if (role !== undefined) await sql`update evaluators set role = ${role} where id = ${id}`;
  if (active !== undefined) await sql`update evaluators set active = ${active} where id = ${id}`;

  const updatedRows = (await sql`select id, name, email, role, active from evaluators where id = ${id} limit 1`) as any[];
  const updated = updatedRows[0];

  const payload: Record<string, unknown> = {};
  if (name !== undefined) payload.name = { from: old.name, to: name };
  if (email !== undefined) payload.email = { from: old.email, to: email };
  if (role !== undefined) payload.role = { from: old.role, to: role };
  if (active !== undefined) payload.active = { from: old.active, to: active };

  const ip = getClientIp(req);
  const action = active === false ? "evaluator.deactivate" : "evaluator.update";
  await writeAudit({
    actorId: evaluator.id,
    actorName: evaluator.name,
    action,
    entity: "evaluator",
    entityId: id,
    payload: { changes: payload, old, updated },
    ip,
  });

  return Response.json(updated);
}
