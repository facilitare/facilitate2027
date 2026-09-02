import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { getSql } from "@/lib/db/client";
import SettingsClient from "./settings-client";

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("fa27_session")?.value;
  if (!token) redirect("/login");
  const payload = await verifySession(token);
  if (!payload || !payload.authed || !payload.evaluatorId) redirect("/login");

  const sql = getSql();
  const rows = (await sql`select id, name, role from evaluators where id = ${payload.evaluatorId} and active = true`) as any[];
  if (!rows.length) redirect("/who");
  const evaluator = rows[0] as { id: string; name: string; role: string };
  if (evaluator.role !== "lead") {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 520, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 28, textAlign: "center", boxShadow: "var(--shadow-sm)" }}>
          <div style={{ width: 44, height: 44, borderRadius: 999, background: "var(--danger-soft)", color: "var(--danger)", display: "grid", placeItems: "center", margin: "0 auto 14px", fontSize: 20, fontWeight: 700 }}>403</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Lead access only</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.5 }}>Settings are available to panel leads only. You are signed in as <strong style={{ color: "var(--text)" }}>{evaluator.name}</strong> (assessor).</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18 }}>
            <a href="/" style={{ padding: "8px 14px", borderRadius: 8, background: "var(--accent)", color: "var(--accent-text)", textDecoration: "none", fontWeight: 600, fontSize: 13 }}>← Dashboard</a>
            <a href="/who" style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface-sunk)", textDecoration: "none", color: "var(--text)", fontSize: 13, fontWeight: 500 }}>Switch user</a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", background: "var(--surface)", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, zIndex: 20 }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <span style={{ width: 28, height: 28, borderRadius: 7, background: "var(--accent)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 11 }}>F27</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>FACILITATE 2027</span>
          <span style={{ fontSize: 12, color: "var(--text-faint)", marginLeft: 6, borderLeft: "1px solid var(--border)", paddingLeft: 10 }}>Signed in as <strong style={{ color: "var(--text)" }}>{evaluator.name}</strong> · lead</span>
        </a>
        <a href="/who" style={{ fontSize: 13, color: "var(--text-muted)", textDecoration: "none", border: "1px solid var(--border)", borderRadius: 999, padding: "5px 12px", background: "var(--surface-sunk)" }}>Switch user</a>
      </header>
      <SettingsClient />
    </div>
  );
}
