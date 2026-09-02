"use client";
import { useEffect, useState } from "react";
export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(()=>{ setTheme(document.documentElement.getAttribute("data-theme") || "system"); },[]);
  function toggle(){
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : cur === "light" ? "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark";
    // Actually simple toggle light/dark
    const target = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", target);
    setTheme(target);
  }
  return <button onClick={toggle} aria-label="Switch between light and dark" className="w-8 h-8 grid place-items-center rounded-[8px] border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]">◐</button>;
}
