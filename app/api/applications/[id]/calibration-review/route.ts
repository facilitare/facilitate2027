import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit, getClientIpFromRequest } from "@/lib/audit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  note: z.string().transform((s) => s.trim()).refine((s) => s.length >= 10, "A note is required (at least 10 characters)"),
});

async function authLead(req: Request) {
  const m = req.headers.get("cookie")?.match(/fa27_session=([^;]+)/);
  const session = m ? await verifySession(m[1]) : null;
  if (!session || !session.authed || !session.evaluatorId) {
    return { error: Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 }) } as const;
  }
  const sql = getSql();
  const rows = (await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`) as any[];
  if (!rows.length) return { error: Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 }) } as const;
  if (rows[0].role !== "lead") return { error: Response.json({ error: "Only leads can mark calibration as reviewed", code: "forbidden" }, { status: 403 }) } as const;
  return { evaluator: rows[0] as { id: string; name: string }, sql } as const;
}

// POST: mark as manually reviewed (or update the note). DELETE: undo.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });
  const auth = await authLead(req);
  if ("error" in auth) return auth.error;
  const { evaluator, sql } = auth;

  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 }); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.errors[0]?.message ?? "Invalid request", code: "bad_request" }, { status: 400 });

  const rows = (await sql`
    update applications
    set calibration_reviewed_by = ${evaluator.id}, calibration_reviewed_at = now(), calibration_note = ${parsed.data.note}, updated_at = now()
    where id = ${id}
    returning id, calibration_reviewed_at
  `) as any[];
  if (!rows.length) return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });

  try {
    await writeAudit({
      actorId: evaluator.id, actorName: evaluator.name,
      action: "application.calibration_reviewed", entity: "application", entityId: id,
      payload: { note: parsed.data.note }, ip: getClientIpFromRequest(req),
    });
  } catch {}

  return Response.json({
    ok: true,
    calibration_reviewed_by_name: evaluator.name,
    calibration_reviewed_at: rows[0].calibration_reviewed_at,
    calibration_note: parsed.data.note,
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });
  const auth = await authLead(req);
  if ("error" in auth) return auth.error;
  const { evaluator, sql } = auth;

  const rows = (await sql`
    update applications
    set calibration_reviewed_by = null, calibration_reviewed_at = null, calibration_note = null, updated_at = now()
    where id = ${id}
    returning id
  `) as any[];
  if (!rows.length) return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });

  try {
    await writeAudit({
      actorId: evaluator.id, actorName: evaluator.name,
      action: "application.calibration_review_cleared", entity: "application", entityId: id,
      payload: {}, ip: getClientIpFromRequest(req),
    });
  } catch {}

  return Response.json({ ok: true });
}
