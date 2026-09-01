import { getSql } from "@/lib/db/client";

export async function GET() {
  const sql = getSql();
  const rows = await sql`select id, name, email, role, active from evaluators where active = true order by name`;
  return Response.json(rows);
}
