import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { config } from "dotenv";
config({ path: ".env.local" });
import { Client } from "pg";

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  // Neon pooler URL works with pg as well
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`);
    const dir = join(process.cwd(), "db/migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const { rows: applied } = await client.query(`select name from _migrations`);
    const appliedSet = new Set(applied.map((r: any) => r.name));
    for (const file of files) {
      if (appliedSet.has(file)) {
        console.log(`skip ${file}`);
        continue;
      }
      const content = readFileSync(join(dir, file), "utf-8");
      console.log(`apply ${file} (${content.length} chars)`);
      await client.query(content);
      await client.query(`insert into _migrations (name) values ($1)`, [file]);
      console.log(`applied ${file}`);
    }
    console.log("migrate done");
  } finally {
    await client.end();
  }
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
