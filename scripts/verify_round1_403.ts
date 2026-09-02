import { config } from "dotenv";
config({ path: ".env.local" });
import { getSql } from "@/lib/db/client";
import { signSession } from "@/lib/auth";
import { GET } from "@/app/api/applications/[id]/round1/route";

async function run() {
  const sql = getSql();
  console.log("=== Round1 HTTP 403 test ===");

  // Get an application that is clean and not flagged, ensure it has no assignment for Marco
  const wave = await sql`select id from waves where wave_number = 1 limit 1`;
  const waveId = (wave as any[])[0].id;

  // Pick an application that is not assigned to Marco
  const app = await sql`select id, ref_code from applications where wave_id = ${waveId} order by ref_code limit 1`;
  const appId = (app as any[])[0].id;
  console.log(" testing app", (app as any[])[0].ref_code, appId);

  // Get evaluators
  const marco = await sql`select id, name, role from evaluators where name = 'Marco Ferretti' limit 1`;
  const ingrid = await sql`select id, name, role from evaluators where name = 'Ingrid Halvorsen' limit 1`;
  const marcoId = (marco as any[])[0].id;
  const ingridId = (ingrid as any[])[0].id;

  // Ensure no assessment for marco on this app (delete if exists)
  await sql`delete from assessments where application_id = ${appId} and evaluator_id = ${marcoId}`;

  // Create tokens
  const marcoToken = await signSession({ authed: true, evaluatorId: marcoId, role: "assessor" });
  const leadToken = await signSession({ authed: true, evaluatorId: ingridId, role: "lead" });

  // 1. Marco (assessor, not assigned) should get 403
  const req1 = new Request(`http://localhost/api/applications/${appId}/round1`, {
    headers: { cookie: `fa27_session=${marcoToken}` },
  });
  const res1 = await GET(req1, { params: Promise.resolve({ id: appId }) });
  console.log(" Marco not assigned status:", res1.status);
  const body1 = await res1.json().catch(()=> ({}));
  console.log(" body:", body1);
  if (res1.status !== 403) throw new Error("Expected 403 for unassigned assessor");

  // 2. Assign Marco to app, then should get 200 and payload should not contain identity
  await sql`insert into assessments (application_id, evaluator_id, state) values (${appId}, ${marcoId}, 'assigned') on conflict do nothing`;
  const req2 = new Request(`http://localhost/api/applications/${appId}/round1`, {
    headers: { cookie: `fa27_session=${marcoToken}` },
  });
  const res2 = await GET(req2, { params: Promise.resolve({ id: appId }) });
  console.log(" Marco assigned status:", res2.status);
  const body2 = await res2.json();
  console.log(" payload keys:", Object.keys(body2));
  const payloadStr = JSON.stringify(body2);
  if (payloadStr.includes("Okonkwo") || payloadStr.includes("Wilhelmina")) {
    // Not necessarily this app, but check identity fields not leaked
    console.log(" payload contains leak?", payloadStr.slice(0,200));
  }
  if (body2.q1_email || body2.q20_full_name || body2.iaf_standing != null) {
    throw new Error("Identity leak in round1 payload: " + JSON.stringify(body2));
  }
  if (!body2.q7_about_session) throw new Error("Round1 should contain q7");
  console.log(" PASS: assigned assessor gets round1 without identity");

  // 3. Lead should get 200 regardless of assignment
  await sql`delete from assessments where application_id = ${appId} and evaluator_id = ${marcoId}`;
  const req3 = new Request(`http://localhost/api/applications/${appId}/round1`, {
    headers: { cookie: `fa27_session=${leadToken}` },
  });
  const res3 = await GET(req3, { params: Promise.resolve({ id: appId }) });
  console.log(" Lead (no assignment) status:", res3.status);
  if (res3.status !== 200) throw new Error("Lead should get 200 even if not assigned");

  // Cleanup: remove test assignment if leftover
  await sql`delete from assessments where application_id = ${appId} and evaluator_id = ${marcoId}`;
  console.log("\n=== Round1 403 test PASS ===");
}
run().catch(e=>{ console.error(e); process.exit(1); });
