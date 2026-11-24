// W1-045 (submitted 6 Nov 2026 08:47 UK) was withdrawn by the applicant, who will resubmit in the next phase.
// Sets status 'withdrawn' and removes untouched assessments (state 'assigned') so assessors don't spend time on it.
// Usage: npx tsx scripts/withdraw_w1_045.ts   (dry run)  |  --yes  (writes)
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
(async () => {
  const yes = process.argv.includes("--yes");
  await c.connect();
  await c.query("begin");
  const app = (await c.query(`select id, ref_code, status from applications
    where ref_code='W1-045' and submitted_at='2026-11-06T08:47:52Z'`)).rows;
  if (app.length !== 1) throw new Error("expected exactly one match, got " + app.length);
  const a = app[0];
  const as = (await c.query(`select s.id, e.name, s.state from assessments s join evaluators e on e.id=s.evaluator_id where s.application_id=$1`, [a.id])).rows;
  console.log(a.ref_code, a.status, "->", as.map(r => `${r.name}:${r.state}`).join(", "));
  const touched = as.filter(r => r.state !== "assigned");
  if (touched.length) throw new Error("Assessments already started: " + touched.map(r => r.name + ":" + r.state).join(","));
  await c.query("delete from assessments where application_id=$1", [a.id]);
  await c.query("update applications set status='withdrawn', updated_at=now() where id=$1", [a.id]);
  if (yes) {
    await c.query(`insert into audit_log (actor_id,actor_name,action,entity,entity_id,payload) values (null,'script','application.withdrawn','applications',$1,$2)`,
      [a.id, JSON.stringify({ ref: a.ref_code, prev_status: a.status, removed_assessors: as.map(r => r.name), reason: "withdrawn by applicant, resubmitting next phase" })]);
    await c.query("commit"); console.log("COMMITTED");
  } else { await c.query("rollback"); console.log("Dry run — rolled back."); }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
