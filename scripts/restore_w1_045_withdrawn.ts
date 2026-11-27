// W1-045 is withdrawn by the applicant, but was moved to Reserve on the panel (26 Nov 2026) before the
// panel excluded withdrawn applications. Puts the status back to 'withdrawn'.
// Usage: npx tsx scripts/restore_w1_045_withdrawn.ts   (dry run)  |  --yes  (writes)
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
(async () => {
  const yes = process.argv.includes("--yes");
  await c.connect();
  await c.query("begin");
  const a = (await c.query(`select id, status, (select count(*)::int from assessments s where s.application_id=applications.id) n
    from applications where ref_code='W1-045'`)).rows;
  if (a.length !== 1) throw new Error("expected one W1-045, got " + a.length);
  console.log("W1-045 before:", a[0].status, "assessments:", a[0].n);
  await c.query("update applications set status='withdrawn', updated_at=now() where id=$1", [a[0].id]);
  if (yes) {
    await c.query(`insert into audit_log (actor_id,actor_name,action,entity,entity_id,payload) values (null,'script','application.withdrawn','applications',$1,$2)`,
      [a[0].id, JSON.stringify({ ref: "W1-045", prev_status: a[0].status, reason: "restore withdrawal after panel move" })]);
    await c.query("commit"); console.log("COMMITTED");
  } else { await c.query("rollback"); console.log("Dry run — rolled back."); }
  console.log("W1-045 now:", (await c.query("select status from applications where id=$1", [a[0].id])).rows[0].status);
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
