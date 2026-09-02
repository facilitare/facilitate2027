import { getSql } from "../lib/db/client";
import { config } from "dotenv";
config({ path: ".env.local" });
async function main(){
  const sql=getSql();
  const apps=await sql`select count(*)::int as c from applications`;
  const ass=await sql`select count(*)::int as c from assessments`;
  const waves=await sql`select id, name, wave_number, status from waves`;
  const evals=await sql`select name, role, active from evaluators`;
  console.log("apps", (apps as any[])[0].c);
  console.log("ass", (ass as any[])[0].c);
  console.log("waves", waves);
  console.log("evals", evals);
  const samp=await sql`select * from applications limit 1`;
  console.log("sample app ref", (samp as any[])[0]?.ref_code);
  const assAny=await sql`select id, state, focus_score from assessments limit 3`;
  console.log("any ass", assAny);
}
main().catch(e=>{console.error(e);process.exit(1)});
