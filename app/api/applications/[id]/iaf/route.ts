import { z } from "zod";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";
import { deriveIafStandingFromForm } from "@/lib/iaf-standing";

const Body = z.object({
  q17_iaf_member: z.enum(["yes", "no", "not_sure"]),
  q18_iaf_qualification: z.string().max(500).nullable(),
  reason: z.string().min(10).max(2000),
});

function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

// Lead-only correction of the IAF answers (e.g. the applicant ticked an accreditation
// only because the form made the question compulsory). Re-imports skip existing emails,
// so this is the way to fix an already-imported application.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });

  const token = getSessionFromRequest(req);
  if (!token) return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  const evalRows = await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`;
  if ((evalRows as any[]).length === 0) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  const evaluator = (evalRows as any[])[0] as { id: string; name: string; role: string };
  if (evaluator.role !== "lead") {
    return Response.json({ error: "Only leads can correct IAF answers", code: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON", code: "bad_request" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Member answer and a reason of at least 10 characters are required", code: "bad_request" }, { status: 400 });
  }

  const appRows = await sql`select id, q17_iaf_member, q18_iaf_qualification, iaf_standing from applications where id = ${id}`;
  if ((appRows as any[]).length === 0) return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });
  const before = (appRows as any[])[0];

  const q17 = parsed.data.q17_iaf_member;
  const q18 = parsed.data.q18_iaf_qualification?.trim() || null;
  const standing = deriveIafStandingFromForm(q17, q18);

  await sql`
    update applications
    set q17_iaf_member = ${q17}, q18_iaf_qualification = ${q18}, iaf_standing = ${standing}, updated_at = now()
    where id = ${id}
  `;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? null;
  await writeAudit({
    actorId: evaluator.id,
    actorName: evaluator.name,
    action: "application.correct_iaf",
    entity: "application",
    entityId: id,
    payload: {
      reason: parsed.data.reason,
      before: { q17: before.q17_iaf_member, q18: before.q18_iaf_qualification, iaf_standing: before.iaf_standing },
      after: { q17, q18, iaf_standing: standing },
    },
    ip,
  });

  return Response.json({ ok: true, iaf_standing: standing });
}
