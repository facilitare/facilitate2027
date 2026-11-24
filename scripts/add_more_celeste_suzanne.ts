// Gives Celeste Britto and Suzanne Trew up to 6 more applications each (Nov 2026, they volunteered
// for more after finishing their first 10): applications below 4 active assessors, fewest-assessors
// last (top-ups first). Skips self-conflicts and applications they already hold.
// Usage: npx tsx scripts/add_more_celeste_suzanne.ts        (dry run)  |  --yes  (writes)
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);
import { Client } from "pg";
import { isSelfConflict } from "../lib/assignment";
const NAMES = ["Celeste Britto", "Suzanne Trew"];
const PER = 6, TARGET = 4;
const c = new Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
(async () => {
  const yes = process.argv.includes("--yes");
  await c.connect();
  await c.query("begin");
  const apps = (await c.query(`
    select a.id, a.ref_code, a.q20_full_name, a.q23_cofacilitators,
      count(s.*) filter (where s.state<>'recused')::int n
    from applications a left join assessments s on s.application_id=a.id
    where a.status <> 'declined' and not a.is_calibration and a.ref_code not in ('W1-001','W1-002','W1-003')
    group by a.id order by a.ref_code`)).rows;
  const plan: string[] = [];
  for (const name of NAMES) {
    const ev = await c.query("select id, email from evaluators where lower(name)=lower($1) and active", [name]);
    if (!ev.rowCount) throw new Error("evaluator not found: " + name);
    const eid = ev.rows[0].id;
    console.log(name, ev.rows[0].email);
    const mine = new Set((await c.query("select application_id from assessments where evaluator_id=$1", [eid])).rows.map(r => r.application_id));
    const pick = apps.filter(a => a.n < TARGET && !mine.has(a.id) && !isSelfConflict(name, [a.q20_full_name, a.q23_cofacilitators]))
      .sort((x, y) => y.n - x.n || x.ref_code.localeCompare(y.ref_code));
    for (const a of pick.slice(0, PER)) {
      await c.query("insert into assessments (application_id,evaluator_id) values ($1,$2)", [a.id, eid]);
      a.n++; plan.push(`${name} <- ${a.ref_code} (now ${a.n})`);
    }
  }
  console.log(plan.join("\n"));
  if (yes) {
    await c.query(`insert into audit_log (actor_id,actor_name,action,entity,entity_id,payload) values (null,'script','assignment.manual','assessments',null,$1)`, [JSON.stringify({ extra_for: NAMES, plan })]);
    await c.query("commit"); console.log("COMMITTED");
  } else { await c.query("rollback"); console.log("Dry run — rolled back."); }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
