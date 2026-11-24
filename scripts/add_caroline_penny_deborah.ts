// Adds Caroline Jessop, Penny Pullan and Deborah Rim Moiso as assessors (Nov 2026, wave-1 second round), gives each the
// 3 practice applications (W1-001..003) plus 10 real ones: first topping up applications
// below 4 active assessors, then the unassigned ones. Skips self-conflicts.
// Usage: npx tsx scripts/add_caroline_penny_deborah.ts        (dry run)  |  --yes  (writes)
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);
import { Client } from "pg";
import { isSelfConflict } from "../lib/assignment";
const NEW = [
  { name: "Caroline Jessop", email: null as string | null },
  { name: "Penny Pullan", email: null as string | null },
  { name: "Deborah Rim Moiso", email: null as string | null },
];
const PRACTICE = ["W1-001", "W1-002", "W1-003"];
const PER = 10, TARGET = 4;
const c = new Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
(async () => {
  const yes = process.argv.includes("--yes");
  await c.connect();
  await c.query("begin");
  const ids: Record<string, string> = {};
  for (const n of NEW) {
    const ex = await c.query("select id from evaluators where lower(name)=lower($1) or lower(email)=lower($2)", [n.name, n.email]);
    ids[n.name] = ex.rowCount ? ex.rows[0].id
      : (await c.query("insert into evaluators (name,email,role) values ($1,$2,'assessor') returning id", [n.name, n.email])).rows[0].id;
  }
  const apps = (await c.query(`
    select a.id, a.ref_code, a.q20_full_name, a.q23_cofacilitators,
      count(s.*) filter (where s.state<>'recused')::int n
    from applications a left join assessments s on s.application_id=a.id
    where a.status <> 'declined' and not a.is_calibration and a.ref_code <> all($1)
    group by a.id order by a.ref_code`, [PRACTICE])).rows;
  const plan: string[] = [];
  for (const n of NEW) {
    const eid = ids[n.name];
    for (const ref of PRACTICE)
      await c.query(`insert into assessments (application_id,evaluator_id) select id,$1 from applications where ref_code=$2 on conflict do nothing`, [eid, ref]);
    const mine = new Set((await c.query("select application_id from assessments where evaluator_id=$1", [eid])).rows.map(r => r.application_id));
    // most-needed first: fewest active assessors, then ref order
    const pick = apps.filter(a => a.n < TARGET && !mine.has(a.id) && !isSelfConflict(n.name, [a.q20_full_name, a.q23_cofacilitators]))
      .sort((x, y) => x.n - y.n || (x.n === 0 ? 0 : 0) || x.ref_code.localeCompare(y.ref_code));
    // gaps (n>=1) before untouched (n=0): top-ups get an application to 4 fastest
    pick.sort((x, y) => (x.n === 0 ? 1 : 0) - (y.n === 0 ? 1 : 0) || y.n - x.n || x.ref_code.localeCompare(y.ref_code));
    for (const a of pick.slice(0, PER)) {
      await c.query("insert into assessments (application_id,evaluator_id) values ($1,$2)", [a.id, eid]);
      a.n++; plan.push(`${n.name} <- ${a.ref_code} (now ${a.n})`);
    }
  }
  console.log(plan.join("\n"));
  if (yes) {
    await c.query(`insert into audit_log (actor_id,actor_name,action,entity,entity_id,payload) values (null,'script','assignment.manual','assessments',null,$1)`, [JSON.stringify({ added: NEW.map(n => n.name), plan })]);
    await c.query("commit"); console.log("COMMITTED");
  } else { await c.query("rollback"); console.log("Dry run — rolled back."); }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });
