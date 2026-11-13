import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { progressStatus, spareCapacity, overMax, summarise, TARGET_PER_ASSESSOR, MAX_PER_ASSESSOR } from "@/lib/evaluator-progress";

const PER_APPLICATION = 4;

function getToken(req: Request): string | null {
  const c = req.headers.get("cookie");
  const m = c?.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

// Lead-only: assessment progress per assessor (organising-team accounts and practice applications excluded).
export async function GET(req: Request) {
  const token = getToken(req);
  const session = token ? await verifySession(token) : null;
  if (!session || !session.authed || !session.evaluatorId) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }
  const sql = getSql();
  const me = (await sql`select role from evaluators where id = ${session.evaluatorId} and active = true`) as any[];
  if (!me.length || me[0].role !== "lead") {
    return Response.json({ error: "Lead access required", code: "forbidden" }, { status: 403 });
  }

  const rows = (await sql`
    select e.id, e.name,
      count(*) filter (where a.state = 'assigned')  ::int as assigned,
      count(*) filter (where a.state = 'draft')     ::int as draft,
      count(*) filter (where a.state = 'submitted') ::int as submitted,
      count(*) filter (where a.state = 'recused')   ::int as recused
    from evaluators e
    left join assessments a on a.evaluator_id = e.id
      and a.application_id in (select id from applications where not is_calibration and status not in ('imported','withdrawn'))
    where e.active = true and e.takes_assessments
    group by e.id, e.name
    order by e.name
  `) as any[];

  const appCount = (await sql`
    select count(*)::int as c from applications where not is_calibration and status not in ('imported','withdrawn')
  `) as any[];
  const applications = appCount[0]?.c ?? 0;

  const assessors = rows.map((r) => {
    const counts = { assigned: r.assigned, draft: r.draft, submitted: r.submitted, recused: r.recused };
    return {
      id: r.id,
      name: r.name,
      ...counts,
      status: progressStatus(counts),
      spare: spareCapacity(counts),
      overMax: overMax(counts),
    };
  });

  const summary = summarise(rows.map((r) => ({ assigned: r.assigned, draft: r.draft, submitted: r.submitted, recused: r.recused })));

  return Response.json(
    {
      assessors,
      summary: { ...summary, applications, required: applications * PER_APPLICATION },
      target: TARGET_PER_ASSESSOR,
      max: MAX_PER_ASSESSOR,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
