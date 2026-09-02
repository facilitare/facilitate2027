"use client";
import { useState } from "react";
export function Toast({ message, type="info", onClose }: { message: string; type?: "info"|"error"; onClose?: ()=>void }) {
  if (!message) return null;
  return (
    <div className={`fixed bottom-4 right-4 bg-[var(--surface)] border border-[var(--border)] rounded-[10px] px-4 py-3 shadow-[var(--shadow-md)] flex items-center gap-3 max-w-sm ${type==="error" ? "border-l-4 border-l-[var(--danger)]" : "border-l-4 border-l-[var(--accent)]"}`}>
      <span className="text-[13px] flex-1">{message}</span>
      <button onClick={onClose} className="text-[var(--text-faint)] hover:text-[var(--text)]">×</button>
    </div>
  );
}
