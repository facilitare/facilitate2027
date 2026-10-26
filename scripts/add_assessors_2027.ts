import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";
const c = new Client({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const NAMES = [
  "Carmen Teodorescu", "Mihaela Danciu", "Alan Heckman", "Laura Brown", "Annekatrin Madlung",
  "Karen Saunders", "Megan Evans", "Sian Madden", "Shalaka Ghundi", "Chizu Matsushita",
  "Nathalie Bertier Ortman", "Suzanne Trew", "Wiebke Herding", "Gerardo De Luzenberger",
  "Cat Duncan Rees", "Rosemary Forest", "Celeste Britto", "Kata Faix", "Paul Nunesdea", "Jane Clift",
];
async function run() {
  await c.connect();
  for (const name of NAMES) {
    const ex = await c.query("select 1 from evaluators where lower(name)=lower($1)", [name]);
    if (ex.rowCount) { console.log("exists:", name); continue; }
    await c.query("insert into evaluators (name, role) values ($1, 'assessor')", [name]);
    console.log("added:", name);
  }
  const r = await c.query("select count(*)::int n from evaluators where active and role='assessor'");
  console.log("active assessors:", r.rows[0].n);
  await c.end();
}
run().catch((e) => { console.error(e); process.exit(1); });
