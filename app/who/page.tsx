"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Evaluator = { id: string; name: string; role: string; email: string };

export default function WhoPage() {
  const [evals, setEvals] = useState<Evaluator[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [adminPw, setAdminPw] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/evaluators")
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j)) setEvals(j);
        else if (j.evaluators) setEvals(j.evaluators);
        else if (j.error) setErr(j.error);
      })
      .catch(() => setErr("Failed to load evaluators"));
  }, []);

  async function select(id: string) {
    const ev = evals.find((e) => e.id === id);
    const isLead = ev?.role === "lead";
    if (isLead && !adminPw) {
      setSelected(id);
      return;
    }
    setLoading(true);
    setErr("");
    const res = await fetch("/api/auth/select-evaluator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evaluatorId: id, adminPassword: isLead ? adminPw : undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Failed to select");
      return;
    }
    router.push("/");
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", padding: "0 24px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Select your name</h1>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 6 }}>Your scores are recorded under this name.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: 12, marginTop: 20 }}>
        {evals.map((e) => (
          <button
            key={e.id}
            onClick={() => {
              setSelected(e.id);
              if (e.role !== "lead") select(e.id);
            }}
            style={{
              textAlign: "left",
              padding: 14,
              borderRadius: 12,
              border: selected === e.id ? "1.5px solid var(--accent)" : "1px solid var(--border)",
              background: selected === e.id ? "var(--accent-soft)" : "var(--surface)",
              cursor: "pointer",
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface-sunk)", display: "grid", placeItems: "center", fontWeight: 600, fontSize: 12 }}>
              {e.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <div style={{ fontWeight: 500, marginTop: 8, fontSize: 14 }}>{e.name}</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 2 }}>
              {e.role} {selected === e.id && e.role === "lead" && "· admin password required"}
            </div>
            {selected === e.id && e.role === "lead" && (
              <div style={{ marginTop: 10 }} onClick={(ev) => ev.stopPropagation()}>
                <input
                  type="password"
                  placeholder="Lead password"
                  value={adminPw}
                  onChange={(ev) => setAdminPw(ev.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}
                />
                <button
                  onClick={() => select(e.id)}
                  disabled={loading}
                  style={{ marginTop: 8, width: "100%", height: 32, borderRadius: 8, border: 0, background: "var(--accent)", color: "var(--accent-text)", fontWeight: 500, cursor: "pointer" }}
                >
                  Continue
                </button>
              </div>
            )}
          </button>
        ))}
      </div>
      {err && <p style={{ color: "var(--danger)", marginTop: 16 }}>{err}</p>}
    </main>
  );
}
