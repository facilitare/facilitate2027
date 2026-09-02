import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";

function getTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

const QuerySchema = z.object({
  entity: z.string().trim().min(1).max(64).optional(),
  entityId: z.string().trim().min(1).max(200).optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      if (!v || v.trim() === "") return 100;
      const n = Number(v);
      if (!Number.isFinite(n)) return 100;
      return Math.min(200, Math.max(1, Math.floor(n)));
    }),
});

export async function GET(req: Request) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  const evalRows = (await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`) as any[];
  if (evalRows.length === 0) {
    return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  }
  const evaluator = evalRows[0] as { id: string; name: string; role: string };
  if (evaluator.role !== "lead") {
    return Response.json({ error: "Only leads can view the audit log", code: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const raw = {
    entity: url.searchParams.get("entity") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? url.searchParams.get("entity_id") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  };
  const parsed = QuerySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: "Invalid query parameters", code: "bad_request" }, { status: 400 });
  }
  const { entity, entityId } = parsed.data;
  const limit = parsed.data.limit as number;

  // Build query with explicit columns, reverse-chron (at desc, id desc)
  let rows: any[];
  if (entity && entityId) {
    rows = (await sql`select id, actor_id, actor_name, action, entity, entity_id, payload, ip, at from audit_log where entity = ${entity} and entity_id = ${entityId} order by at desc, id desc limit ${limit}`) as any[];
  } else if (entity) {
    rows = (await sql`select id, actor_id, actor_name, action, entity, entity_id, payload, ip, at from audit_log where entity = ${entity} order by at desc, id desc limit ${limit}`) as any[];
  } else if (entityId) {
    rows = (await sql`select id, actor_id, actor_name, action, entity, entity_id, payload, ip, at from audit_log where entity_id = ${entityId} order by at desc, id desc limit ${limit}`) as any[];
  } else {
    rows = (await sql`select id, actor_id, actor_name, action, entity, entity_id, payload, ip, at from audit_log order by at desc, id desc limit ${limit}`) as any[];
  }

  return Response.json(
    { entries: rows, total: rows.length, limit, filters: { entity: entity ?? null, entityId: entityId ?? null } },
    { headers: { "Cache-Control": "no-store" } }
  );
}
