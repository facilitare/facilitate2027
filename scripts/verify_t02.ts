import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
async function run() {
  await c.connect();
  await c.query("drop table if exists test_foo, test_foo2");
  console.log("dropped test tables");
  // AC checks
  try {
    await c.query("insert into assessments (application_id, evaluator_id, state, focus_score) values ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','submitted',1)");
    console.log("FAIL: should reject null scores");
  } catch (e: any) {
    console.log("PASS: submitted with null rejected ->", e.message.slice(0, 120));
  }
  try {
    const ev = await c.query("select id from evaluators limit 1");
    const app = await c.query("select id from applications limit 1");
    await c.query(
      "insert into assessments (application_id, evaluator_id, state, focus_score, content_score, interactivity_score, credibility_score, focus_no_evidence, feedback_liked, feedback_improve, submitted_at) values ($1,$2,'draft',2,2,2,2,true,'aaaaaaaaaaaaaaaaaaaa','bbbbbbbbbbbbbbbbbbbb', now())",
      [app.rows[0].id, ev.rows[0].id]
    );
    console.log("FAIL: should reject no_evidence with 2");
  } catch (e: any) {
    console.log("PASS: no_evidence forces 0 ->", e.message.slice(0, 120));
  }
  await c.end();
}
run().catch(console.error);
