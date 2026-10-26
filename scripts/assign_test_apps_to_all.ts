// Assigns the 3 practice applications (W1-001..003) to every active assessor that lacks them.
import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  const r = await c.query(
    `insert into assessments (application_id, evaluator_id, state)
     select a.id, e.id, 'assigned' from applications a cross join evaluators e
     where a.ref_code in ('W1-001','W1-002','W1-003') and e.active and e.role='assessor'
     on conflict (application_id, evaluator_id) do nothing`
  );
  console.log("inserted:", r.rowCount);
  const t = await c.query(`select a.ref_code, count(*)::int n from assessments s join applications a on a.id=s.application_id group by 1 order by 1`);
  console.table(t.rows);
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
