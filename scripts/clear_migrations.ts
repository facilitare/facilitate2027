import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
async function run() {
  await sql`delete from _migrations where name in ('001_init.sql','002_settings_seed.sql')`;
  console.log("cleared");
  const r = await sql`select * from _migrations`;
  console.log(r);
}
run().catch(console.error);
