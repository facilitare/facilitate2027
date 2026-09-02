import { z } from "zod";
import { verifySession, getClientIp } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import { processImport } from "@/lib/import/process";
import { writeAudit } from "@/lib/audit";

function getSessionFromRequest(req: Request): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const m = cookie.match(/fa27_session=([^;]+)/);
  return m ? m[1] : null;
}

export async function POST(req: Request) {
  const token = getSessionFromRequest(req);
  if (!token) return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  const session = await verifySession(token);
  if (!session || !session.authed || !session.evaluatorId) {
    return Response.json({ error: "Not authenticated", code: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();
  const evalRows = await sql`select id, name, role from evaluators where id = ${session.evaluatorId} and active = true`;
  if ((evalRows as any[]).length === 0) return Response.json({ error: "Evaluator not found", code: "not_found" }, { status: 404 });
  const evaluator = (evalRows as any[])[0] as { id: string; name: string; role: string };
  if (evaluator.role !== "lead") {
    return Response.json({ error: "Only leads can import", code: "forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data", code: "bad_request" }, { status: 400 });
  }

  const file = (formData.get("file") || formData.get("csv")) as File | null;
  if (!file || typeof (file as any).text !== "function") {
    return Response.json({ error: "CSV file required (field 'file')", code: "bad_request" }, { status: 400 });
  }

  const csvText = await (file as File).text();
  if (!csvText || csvText.trim().length === 0) {
    return Response.json({ error: "Empty CSV", code: "bad_request" }, { status: 400 });
  }

  // Optional waveId and mapping override
  const waveIdRaw = formData.get("waveId") as string | null;
  const mappingRaw = formData.get("mapping") as string | null;
  let mappingOverride: Record<string, string | null> | undefined;
  if (mappingRaw) {
    try {
      const parsed = JSON.parse(mappingRaw);
      if (typeof parsed === "object" && parsed !== null) {
        mappingOverride = parsed;
      }
    } catch {
      return Response.json({ error: "Invalid mapping JSON", code: "bad_request" }, { status: 400 });
    }
  }

  // Resolve wave
  let waveId = waveIdRaw;
  let waveNumber = 1;
  if (waveId) {
    const w = await sql`select id, wave_number from waves where id = ${waveId}`;
    if ((w as any[]).length === 0) return Response.json({ error: "Wave not found", code: "not_found" }, { status: 404 });
    waveNumber = (w as any[])[0].wave_number;
  } else {
    const w = await sql`select id, wave_number from waves order by wave_number asc limit 1`;
    if ((w as any[]).length === 0) return Response.json({ error: "No waves found", code: "not_found" }, { status: 404 });
    waveId = (w as any[])[0].id;
    waveNumber = (w as any[])[0].wave_number;
  }

  const ip = getClientIp(req);

  // Dry run must not write anything to applications, but we still call processImport with doCommit false
  const report = await processImport({
    waveId: waveId!,
    waveNumber,
    csvText,
    doCommit: false,
    mappingOverride,
    actorId: evaluator.id,
    actorName: evaluator.name,
    ip,
  });

  // Optionally audit dry run without writing to DB? Spec says use audit, but AC says dry run writes nothing.
  // We do not write audit for dry-run to keep "writes nothing" strictly.
  // If needed, uncomment:
  // await writeAudit({ actorId: evaluator.id, actorName: evaluator.name, action: 'import.dry_run', entity: 'wave', entityId: waveId, payload: { rowsRead: report.rowsRead, duplicates: report.duplicates.length }, ip });

  return Response.json(report);
}
