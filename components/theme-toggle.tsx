"use client";
import { useEffect, useState } from "react";

// Light is the default for everyone (practice round 1 feedback); dark is opt-in and remembered per browser.
export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("fa27-theme", next); } catch {}
    setTheme(next);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light view" : "Switch to dark view"}
      style={{ position: "fixed", left: 12, bottom: 76, zIndex: 25, fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 999, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", cursor: "pointer", boxShadow: "var(--shadow-sm)" }}
    >
      {theme === "dark" ? "☀ Light view" : "☾ Dark view"}
    </button>
  );
}
