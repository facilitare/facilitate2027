// Deborah Rim Moiso joins at the 30 Nov orientation and hasn't had the video guide, so she starts then.
// Removes her 10 real applications (only if untouched: state 'assigned'), keeps the 3 practice ones.
// Usage: npx tsx scripts/remove_deborah_real.ts   (dry run)  |  --yes  (writes)
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
(async () => {
  const yes = process.argv.includes("--yes");
  await c.connect();
  await c.query("begin");
  const ev = (await c.query("select id from evaluators where name='Deborah Rim Moiso'")).rows[0].id;
  const rows = (await c.query(`select s.id, a.ref_code, s.state from assessments s join applications a on a.id=s.application_id
    where s.evaluator_id=$1 order by a.ref_code`, [ev])).rows;
  console.log(rows.map(r => `${r.ref_code}:${r.state}`).join(" "));
  const real = rows.filter(r => !["W1-001", "W1-002", "W1-003"].includes(r.ref_code));
  const touched = real.filter(r => r.state !== "assigned");
  if (touched.length) throw new Error("Not untouched: " + touched.map(r => r.ref_code + ":" + r.state).join(","));
  const del = await c.query("delete from assessments where id = any($1::uuid[]) returning id", [real.map(r => r.id)]);
  console.log("removed", del.rowCount);
  if (yes) {
    await c.query(`insert into audit_log (actor_id,actor_name,action,entity,entity_id,payload) values (null,'script','assignment.manual','assessments',null,$1)`,
      [JSON.stringify({ removed_for: "Deborah Rim Moiso", refs: real.map(r => r.ref_code) })]);
    await c.query("commit"); console.log("COMMITTED");
  } else { await c.query("rollback"); console.log("Dry run — rolled back."); }
  const left = (await c.query(`select a.ref_code from assessments s join applications a on a.id=s.application_id where s.evaluator_id=$1 order by 1`, [ev])).rows;
  console.log("now holds:", left.map(r => r.ref_code).join(" "));
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
