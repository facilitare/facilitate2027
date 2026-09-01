"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (res.status === 429) setErr("Too many attempts — try again in 15 minutes.");
      else setErr(j.error || "Incorrect password");
      return;
    }
    router.push("/who");
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", padding: 24 }}>
      <form
        onSubmit={submit}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: 32,
          width: "100%",
          maxWidth: 380,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--accent)", color: "var(--accent-text)", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 13, marginBottom: 16 }}>F27</div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>FACILITATE 2027</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>Private assessment — enter the shared panel password.</p>
        <label style={{ display: "block", marginTop: 20, fontSize: 13, fontWeight: 500 }}>Password</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="••••••••"
          autoFocus
          style={{
            marginTop: 6,
            width: "100%",
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-sunk)",
            fontSize: 14,
            outline: "none",
          }}
        />
        {err && <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{err}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 16,
            width: "100%",
            height: 40,
            borderRadius: 8,
            border: 0,
            background: "var(--accent)",
            color: "var(--accent-text)",
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Checking…" : "Continue →"}
        </button>
      </form>
    </main>
  );
}
