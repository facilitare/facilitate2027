export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "80px auto", padding: "0 24px" }}>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 32,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "var(--accent)",
            color: "var(--accent-text)",
            display: "grid",
            placeItems: "center",
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          F27
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>
          FACILITATE 2027 — Session Assessment
        </h1>
        <p style={{ color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6 }}>
          Design tokens active. Light/dark follows your OS. Build OK — next step is authentication (T03).
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
          <a
            href="/styleguide"
            style={{
              background: "var(--accent)",
              color: "var(--accent-text)",
              padding: "10px 16px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Styleguide →
          </a>
          <a
            href="/login"
            style={{
              border: "1px solid var(--border-strong)",
              padding: "10px 16px",
              borderRadius: 8,
              textDecoration: "none",
              color: "var(--text)",
              fontWeight: 500,
              fontSize: 14,
            }}
          >
            Login
          </a>
        </div>
      </div>
      <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 16, textAlign: "center" }}>
        T01 — Project setup · Next.js 15 · Tailwind v4 · Neon · Vercel
      </p>
    </main>
  );
}
