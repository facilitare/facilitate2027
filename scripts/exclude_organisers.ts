// Organising-team accounts: keep active (admin area) but never assign them applications.
import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const NAMES = ["Alice Blackwell", "Christine Bell", "Helene Jewell", "Paul Brand", "Bogdan Grigore"];
(async () => {
  await c.connect();
  const u = await c.query("update evaluators set takes_assessments=false where name = any($1) returning name", [NAMES]);
  console.log("excluded:", u.rows.map((r) => r.name).join(", "));
  // untouched test assignments only; drafts and submitted test work stay
  const d = await c.query(
    `delete from assessments where state='assigned' and evaluator_id in (select id from evaluators where not takes_assessments) returning id`
  );
  console.log("removed untouched test assignments:", d.rowCount);
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
