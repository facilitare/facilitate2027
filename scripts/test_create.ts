import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
async function run() {
  try {
    await sql`create table if not exists test_foo (id int primary key)`;
    console.log("test_foo created via sql tag");
  } catch (e) { console.error("tag failed", e); }
  try {
    await sql.unsafe("create table if not exists test_foo2 (id int primary key)");
    console.log("test_foo2 created via unsafe");
  } catch (e) { console.error("unsafe failed", e); }
  const r = await sql`select tablename from pg_tables where tablename like 'test_foo%'`;
  console.log(r);
  // try first statement of 001 directly
  try {
    await sql.unsafe("create extension if not exists pgcrypto");
    console.log("extension ok");
  } catch (e) { console.error("extension failed", e); }
  try {
    await sql.unsafe(`create table evaluators (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text unique,
  role        text not null default 'assessor' check (role in ('assessor', 'lead')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
)`);
    console.log("evaluators created");
  } catch (e) { console.error("evaluators failed", e); }
  const r2 = await sql`select tablename from pg_tables where schemaname='public' order by tablename`;
  console.log("all tables", r2);
}
run().catch(console.error);
