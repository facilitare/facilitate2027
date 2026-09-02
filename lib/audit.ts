import { getSql } from "@/lib/db/client";

export async function writeAudit(params: {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
  ip?: string | null;
}) {
  const sql = getSql();
  await sql`
    insert into audit_log (actor_id, actor_name, action, entity, entity_id, payload, ip)
    values (
      ${params.actorId ?? null},
      ${params.actorName ?? null},
      ${params.action},
      ${params.entity},
      ${params.entityId ?? null},
      ${params.payload ? JSON.stringify(params.payload) : null}::jsonb,
      ${params.ip ?? null}
    )
  `;
}

export function getClientIpFromRequest(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return null;
}
