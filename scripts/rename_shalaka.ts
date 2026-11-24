// Spelling fix requested by the assessor herself (Nov 2026): Ghundi -> Gundi.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true } as any);
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
(async () => {
  await c.connect();
  const r = await c.query("update evaluators set name=$1 where name=$2 returning id, name", ["Shalaka Gundi", "Shalaka Ghundi"]);
  console.log("updated", r.rows);
  console.log((await c.query("select name from evaluators where name ilike '%shalaka%'")).rows);
  await c.end();
})();
