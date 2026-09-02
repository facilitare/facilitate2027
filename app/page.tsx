import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import DashboardClient from "./dashboard-client";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("fa27_session")?.value;
  if (!token) redirect("/login");
  const payload = await verifySession(token);
  if (!payload || !payload.authed) redirect("/login");
  if (!payload.evaluatorId) redirect("/who");

  const evaluatorName = "";
  // Header is rendered by DashboardClient fetch; this page provides the top frame + Switch link
  // We pass nothing — auth is verified — client will load evaluator name via /api/queue;
  // we also render a server-side header with Signed in as ... using payload if we had name, but
  // we fetch name client-side to avoid extra DB query here (middleware already did minimal).
  // Instead, include a thin server header with Switch link (client will also show wave header).
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: "var(--accent)",
              color: "var(--accent-text)",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: ".02em",
            }}
          >
            F27
          </span>
          <span style={{ fontWeight: 600, fontSize: 13, letterSpacing: "-.01em" }}>FACILITATE 2027</span>
        </a>
        <a
          href="/who"
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            textDecoration: "none",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "5px 12px",
            background: "var(--surface-sunk)",
          }}
        >
          Switch user
        </a>
      </header>
      <DashboardClient />
    </div>
  );
}
