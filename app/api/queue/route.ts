import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";

function getTokenFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

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

  const evalRows = await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`;
  if ((evalRows as any[]).length === 0) {
    return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  }
  const evaluator = (evalRows as any[])[0] as { id: string; name: string; role: string };
  const isLead = evaluator.role === "lead";

  // Wave — prefer the wave of the evaluator's earliest assignment, otherwise the first wave
  let wave: { id: string; name: string; status: string } | null = null;
  const waveFromAssignments = await sql`
    select w.id, w.name, w.status
    from assessments a
    join applications app on app.id = a.application_id
    join waves w on w.id = app.wave_id
    where a.evaluator_id = ${evaluator.id}
    order by a.assigned_at asc
    limit 1
  `;
  if ((waveFromAssignments as any[]).length > 0) {
    wave = (waveFromAssignments as any[])[0];
  } else {
    const w = await sql`select id, name, status from waves order by wave_number asc limit 1`;
    if ((w as any[]).length > 0) wave = (w as any[])[0];
  }

  // Queue: all assessments for this evaluator, joined with application data
  const rows = await sql`
    select
      a.id as assessment_id,
      a.application_id,
      a.state,
      a.assigned_at,
      a.updated_at,
      a.focus_score, a.content_score, a.interactivity_score, a.credibility_score,
      a.feedback_liked, a.feedback_improve,
      a.focus_no_evidence, a.content_no_evidence, a.interactivity_no_evidence, a.credibility_no_evidence,
      app.ref_code, app.q11_theme,
      app.q7_about_session, app.q7b_benefits,
      app.redacted_q7, app.redacted_q7b
    from assessments a
    join applications app on app.id = a.application_id
    where a.evaluator_id = ${evaluator.id}
    order by a.assigned_at asc, app.ref_code asc
  ` as any[];

  const queue = (rows as any[]).map((r) => {
    const rawDesc: string = (r.redacted_q7 ?? r.q7_about_session ?? r.q7b_benefits ?? "") as string;
    const excerpt = rawDesc.slice(0, 120);
    const hasAnyScore =
      r.focus_score !== null ||
      r.content_score !== null ||
      r.interactivity_score !== null ||
      r.credibility_score !== null ||
      !!r.focus_no_evidence ||
      !!r.content_no_evidence ||
      !!r.interactivity_no_evidence ||
      !!r.credibility_no_evidence ||
      (r.feedback_liked && r.feedback_liked.trim().length > 0) ||
      (r.feedback_improve && r.feedback_improve.trim().length > 0);
    // Draft chip when partially filled: state draft, or assigned but has any value
    const isDraft = r.state === "draft" || (r.state === "assigned" && hasAnyScore);
    return {
      assessmentId: r.assessment_id as string,
      applicationId: r.application_id as string,
      ref_code: r.ref_code as string,
      theme: r.q11_theme as string | null,
      excerpt,
      state: r.state as string,
      assigned_at: r.assigned_at as string,
      updated_at: r.updated_at as string,
      isDraft,
      hasAnyScore,
    };
  });

  const total = queue.length;
  const submitted = queue.filter((q) => q.state === "submitted").length;
  const todo = queue.filter((q) => q.state === "assigned" || q.state === "draft");
  const nextAssessment = todo.length > 0 ? todo[0] : null;

  const counts = {
    total,
    assigned: total,
    submitted,
    todo: todo.length,
    recused: queue.filter((q) => q.state === "recused").length,
  };

  return Response.json(
    {
      evaluator: { id: evaluator.id, name: evaluator.name, role: evaluator.role, isLead },
      wave,
      counts,
      queue,
      nextAssessmentId: nextAssessment?.assessmentId ?? null,
      nextApplicationId: nextAssessment?.applicationId ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
