import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
async function run() {
  const r = await sql`select tablename from pg_tables where schemaname='public' order by tablename`;
  console.log("tables", r);
  const m = await sql`select * from _migrations`;
  console.log("migrations", m);
  const c = await sql`select count(*)::int as c from pg_tables where tablename='evaluators'`;
  console.log("evaluators exists check", c);
}
run().catch(console.error);
