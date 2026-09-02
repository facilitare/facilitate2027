import { z } from "zod";
import { verifySession, getClientIp } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { writeAudit } from "@/lib/audit";

// Explicit allow-list — every column is spelled out in the SQL. Do not use star-select.
const ROUND1_COLUMNS = [
  "id",
  "ref_code",
  "wave_id",
  "q11_theme",
  "q4_session_provides",
  "q4_session_provides_other",
  "q5_audience",
  "q5_audience_other",
  "q6_audience_detail",
  "q7_about_session",
  "q7b_benefits",
  "q8_group_setup",
  "q8_group_setup_other",
  "q9_room_layout",
  "q10_delivery_mode",
  "q12_timekeeping",
  "q13_participation_level",
  "q14_methods",
  "q14_methods_other",
  "q15_first_ten_minutes",
  "q16_pathway",
  "q17_iaf_member",
  "q18_iaf_qualification",
  "q19_large_groups_english",
] as const;

function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate UUID
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return Response.json({ error: "Invalid id", code: "bad_request" }, { status: 400 });
  }

  const token = getSessionFromRequest(req);
  if (!token) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();

  // Load evaluator to get role/name (authoritative)
  const evalRows = await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`;
  if ((evalRows as any[]).length === 0) {
    return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  }
  const evaluator = (evalRows as any[])[0] as { id: string; name: string; role: string };
  const isLead = evaluator.role === "lead";

  // Check application exists (lightweight)
  const exists = await sql`select id from applications where id = ${id}`;
  if ((exists as any[]).length === 0) {
    return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });
  }

  // Access control: must be assigned to this application or be a lead
  if (!isLead) {
    const assigned = await sql`select id from assessments where application_id = ${id} and evaluator_id = ${evaluator.id} limit 1`;
    if ((assigned as any[]).length === 0) {
      return Response.json({ error: "Not assigned to this application", code: "forbidden" }, { status: 403 });
    }
  }

  // IMPORTANT: spell columns explicitly — do not use star select
  // We also fetch redacted columns server-side for substitution, but do not expose them raw.
  const rows = await sql`
    select
      id, ref_code, wave_id, q11_theme,
      q4_session_provides, q4_session_provides_other,
      q5_audience, q5_audience_other, q6_audience_detail,
      q7_about_session, q7b_benefits, q8_group_setup, q8_group_setup_other,
      q9_room_layout, q10_delivery_mode, q12_timekeeping,
      q13_participation_level, q14_methods, q14_methods_other,
      q15_first_ten_minutes, q16_pathway,
      q17_iaf_member, q18_iaf_qualification,
      q19_large_groups_english,
      redacted_q7, redacted_q7b, redacted_q16, redacted_q19,
      anonymity_flag, anonymity_notes
    from applications
    where id = ${id}
    limit 1
  `;

  if ((rows as any[]).length === 0) {
    return Response.json({ error: "Application not found", code: "not_found" }, { status: 404 });
  }

  const row = (rows as any[])[0];

  // Substitute redactions: if redacted_q* is non-null, return it as the corresponding q field
  const result: Record<string, unknown> = {};
  for (const col of ROUND1_COLUMNS) {
    result[col] = row[col];
  }

  // Apply redaction substitution
  if (row.redacted_q7 != null) result.q7_about_session = row.redacted_q7;
  if (row.redacted_q7b != null) result.q7b_benefits = row.redacted_q7b;
  if (row.redacted_q16 != null) result.q16_pathway = row.redacted_q16;
  if (row.redacted_q19 != null) result.q19_large_groups_english = row.redacted_q19;

  // Explicitly hide internal fields: iaf_standing is not returned, nor are identity fields.
  // Ensure we do not leak redacted_* keys or anonymity internal.
  // anonymity_flag/notes are included for lead UI, but assessors see flag? Assessors need to know?
  // We expose flag status but not redacted raw.
  result.anonymity_flag = row.anonymity_flag;
  if (row.anonymity_notes) result.anonymity_notes = row.anonymity_notes;

  // Never expose iaf_standing

  return Response.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
