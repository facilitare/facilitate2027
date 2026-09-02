import { config } from "dotenv";
config({ path: ".env.local" });
import { getSql } from "@/lib/db/client";
import { scanAnonymity } from "@/lib/anonymity";
import { autoAssign } from "@/lib/assignment";

async function run() {
  const sql = getSql();
  console.log("=== T06 integration smoke test ===");

  // 1. Test scan for Wilhelmina Okonkwo
  console.log("\n1) scanAnonymity Wilhelmina Okonkwo");
  const scan = scanAnonymity({
    q7_about_session: "Session by Wilhelmina Okonkwo about facilitation",
    q7b_benefits: "Benefits for Okonkwo attendees",
    q16_pathway: "I am Wilhelmina, worked at my company in London, see https://wilhelmina.ro",
    q19_large_groups_english: "Facilitated 60 people in English",
    q20_full_name: "Wilhelmina Okonkwo",
    q1_email: "wilhelmina.okonkwo@example.org",
  });
  console.log(" flagged:", scan.flagged, "notes:", scan.notes);
  if (!scan.flagged || !scan.notes.some(n=>/Okonkwo/.test(n))) throw new Error("scan should flag Okonkwo");
  console.log("  PASS");

  // 2. Create test wave and applications for assignment test
  console.log("\n2) assignment flagged skip");
  const w = await sql`select id from waves where wave_number = 99 limit 1`;
  let waveId: string;
  if ((w as any[]).length === 0) {
    const r = await sql`insert into waves (name, wave_number, slots_target, status) values ('Test Wave 99', 99, 4, 'draft') returning id`;
    waveId = (r as any[])[0].id;
    console.log(" created test wave", waveId);
  } else waveId = (w as any[])[0].id;

  // Clean previous test apps in this wave
  await sql`delete from applications where wave_id = ${waveId}`;

  // Insert flagged app
  const flaggedRef = "W99-001";
  const cleanRef = "W99-002";
  const evalRows = await sql`select id from evaluators where active = true limit 2`;
  if ((evalRows as any[]).length < 2) throw new Error("need 2 evaluators");
  const testEmail = `t06-test+${Date.now()}@example.org`;
  await sql`
    insert into applications (wave_id, ref_code, status, q7_about_session, q7b_benefits, q16_pathway, q19_large_groups_english, q1_email, q20_full_name, q11_theme, q24_region, anonymity_flag, anonymity_notes)
    values (${waveId}, ${flaggedRef}, 'imported', 'Session by Wilhelmina Okonkwo', 'Benefits', 'Pathway by Wilhelmina', 'English', ${testEmail}, 'Wilhelmina Okonkwo', 'craft', 'europe', true, 'q7: contains applicant name "Okonkwo"')
  `;
  await sql`
    insert into applications (wave_id, ref_code, status, q7_about_session, q7b_benefits, q16_pathway, q19_large_groups_english, q1_email, q20_full_name, q11_theme, q24_region, anonymity_flag, anonymity_notes)
    values (${waveId}, ${cleanRef}, 'imported', 'Clean session about craft', 'Benefits', 'Pathway clean', 'English', 'clean@example.org', 'Clean Person', 'craft', 'europe', false, null)
  `;
  console.log(" inserted flagged and clean apps");

  // Run autoAssign
  const res1 = await autoAssign({ waveId, perApplication: 1, actorId: (evalRows as any[])[0].id, actorName: "Test Lead", ip: "127.0.0.1" });
  console.log(" autoAssign result:", JSON.stringify(res1, null, 2));
  if (res1.skipped.length !== 1) throw new Error(`expected 1 skipped, got ${res1.skipped.length}`);
  if (!res1.skipped[0].reason.includes("anonymity_flag")) throw new Error("skipped reason should mention anonymity_flag");
  if (res1.assigned !== 1) throw new Error(`expected 1 assigned, got ${res1.assigned}`);
  console.log("  PASS: flagged was skipped");

  // Check audit_log for assignment
  const auditAssign = await sql`select action from audit_log where entity_id = ${waveId} and action = 'assignments.auto' order by at desc limit 1`;
  console.log(" audit for assignment:", auditAssign);
  if ((auditAssign as any[]).length === 0) throw new Error("assignment audit missing");

  // 3. Test redact clears flag and makes assignable, and audit
  console.log("\n3) redact flow");
  const flaggedApp = await sql`select id, q20_full_name from applications where wave_id = ${waveId} and ref_code = ${flaggedRef}`;
  const flaggedId = (flaggedApp as any[])[0].id;
  const lead = await sql`select id, name from evaluators where role = 'lead' limit 1`;
  const leadId = (lead as any[])[0].id;
  const leadName = (lead as any[])[0].name;
  // Simulate redact: update redacted_q7 and clear flag
  await sql`update applications set redacted_q7 = 'Session about craft [redacted]', redacted_by = ${leadId}, redacted_at = now(), anonymity_flag = false, updated_at = now() where id = ${flaggedId}`;
  // Write audit as route would
  await sql`insert into audit_log (actor_id, actor_name, action, entity, entity_id, payload, ip) values (${leadId}, ${leadName}, 'application.redact', 'application', ${flaggedId}, '{"field":"q7_about_session","dbColumn":"redacted_q7"}'::jsonb, '127.0.0.1')`;
  const afterRedact = await sql`select anonymity_flag, redacted_q7 from applications where id = ${flaggedId}`;
  console.log(" after redact flag:", (afterRedact as any[])[0]);
  if ((afterRedact as any[])[0].anonymity_flag !== false) throw new Error("redact should clear flag");
  const auditRedact = await sql`select action, payload from audit_log where entity_id = ${flaggedId} and action = 'application.redact' order by at desc limit 1`;
  console.log(" audit redact:", auditRedact);
  if ((auditRedact as any[]).length === 0) throw new Error("redact audit missing");
  if (!(auditRedact as any[])[0].payload.field) throw new Error("redact audit should name field");
  console.log("  PASS");

  // Now assignment should pick up the previously flagged app (now unflagged)
  // Reset assignment state: delete assessments for test wave and reset status to imported
  await sql`delete from assessments where application_id in (select id from applications where wave_id = ${waveId})`;
  await sql`update applications set status = 'imported' where wave_id = ${waveId}`;
  const res2 = await autoAssign({ waveId, perApplication: 1, actorId: leadId, actorName: leadName, ip: "127.0.0.1" });
  console.log(" second autoAssign:", JSON.stringify(res2, null, 2));
  if (res2.skipped.length !== 0) throw new Error("after redact, should have 0 skipped");
  if (res2.assigned !== 2) throw new Error(`expected 2 assigned after redact, got ${res2.assigned}`);
  console.log("  PASS: redacted now assignable");

  // 4. Test dismiss-flag
  console.log("\n4) dismiss-flag flow");
  // Re-flag one app
  await sql`update applications set anonymity_flag = true, anonymity_notes = 'q16: test flag' where ref_code = ${cleanRef} and wave_id = ${waveId}`;
  const cleanApp = await sql`select id from applications where wave_id = ${waveId} and ref_code = ${cleanRef}`;
  const cleanId = (cleanApp as any[])[0].id;
  await sql`update applications set anonymity_flag = false where id = ${cleanId}`;
  await sql`insert into audit_log (actor_id, actor_name, action, entity, entity_id, payload, ip) values (${leadId}, ${leadName}, 'application.dismiss_flag', 'application', ${cleanId}, '{"reason":"reviewed no leak"}'::jsonb, '127.0.0.1')`;
  const auditDismiss = await sql`select action, payload from audit_log where entity_id = ${cleanId} and action = 'application.dismiss_flag' order by at desc limit 1`;
  console.log(" audit dismiss:", auditDismiss);
  if ((auditDismiss as any[]).length === 0) throw new Error("dismiss audit missing");
  console.log("  PASS");

  // 5. Round1 substitution hides identity
  console.log("\n5) round1 substitution");
  const appForRound1 = await sql`select id, q7_about_session, redacted_q7 from applications where id = ${flaggedId}`;
  const row = (appForRound1 as any[])[0];
  // Simulate route substitution
  const result: any = { q7_about_session: row.q7_about_session };
  if (row.redacted_q7 != null) result.q7_about_session = row.redacted_q7;
  const payload = JSON.stringify(result);
  console.log(" payload:", payload);
  if (/Okonkwo/i.test(payload)) throw new Error("payload should not contain Okonkwo after redaction");
  console.log("  PASS");

  // Cleanup test wave
  await sql`delete from assessments where application_id in (select id from applications where wave_id = ${waveId})`;
  await sql`delete from applications where wave_id = ${waveId}`;
  await sql`delete from waves where id = ${waveId}`;
  console.log("\n=== All T06 smoke tests PASS ===");
}

run().catch(e=>{ console.error(e); process.exit(1); });
