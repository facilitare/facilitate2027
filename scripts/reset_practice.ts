// Removes all applications (and, by cascade, their assessments and panel decisions)
// so a new practice round starts clean. Evaluators, waves, settings and audit log stay.
// Usage: npx tsx scripts/reset_practice.ts         -> shows what would be deleted
//        npx tsx scripts/reset_practice.ts --yes   -> deletes
import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const { rows } = await c.query(
    `select (select count(*) from applications) apps, (select count(*) from assessments) assessments, (select count(*) from panel_decisions) decisions`
  );
  console.table(rows);
  if (!process.argv.includes("--yes")) {
    console.log("Dry run. Re-run with --yes to delete.");
  } else {
    await c.query("begin");
    await c.query("delete from applications");
    await c.query(
      `insert into audit_log (actor_id, actor_name, action, entity, entity_id, payload) values (null, 'script', 'practice.reset', 'applications', null, $1)`,
      [JSON.stringify(rows[0])]
    );
    await c.query("commit");
    console.log("Deleted. Now import practice-round2-import.csv in Admin → Import.");
  }
  await c.end();
})();
