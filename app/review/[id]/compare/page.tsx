import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import CompareClient from "./compare-client";

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(id)) {
    return (
      <main style={{ padding: 32 }}>
        <h1>Invalid application id</h1>
      </main>
    );
  }
  const cookieStore = await cookies();
  const token = cookieStore.get("fa27_session")?.value;
  if (!token) redirect("/login");
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) redirect("/login");

  // The link from the "submitted" screen carries the assessment id; the archive carries the application id.
  const sql = getSql();
  const rows = (await sql`select application_id from assessments where id = ${id} limit 1`) as any[];
  const applicationId = rows.length ? (rows[0].application_id as string) : id;

  return <CompareClient applicationId={applicationId} />;
}
