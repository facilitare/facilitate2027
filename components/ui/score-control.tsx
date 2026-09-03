"use client";
import { CRITERIA, type CriterionKey, type ScoreValue } from "@/lib/rubric";
import { cn } from "@/lib/utils";
import { useId, useState } from "react";

type Props = {
  criterion: CriterionKey;
  value: ScoreValue | null;
  noEvidence: boolean;
  onChange: (v: ScoreValue | null, noEvidence: boolean) => void;
  defaultExpanded?: boolean;
};

export function ScoreControl({ criterion, value, noEvidence, onChange, defaultExpanded }: Props) {
  const crit = CRITERIA.find((c) => c.key === criterion)!;
  const groupId = useId();
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const showAnchor = expanded;

  function select(v: ScoreValue) {
    if (noEvidence) return;
    onChange(v, false);
    if (!expanded) setExpanded(true);
  }

  function toggleNoEvidence(checked: boolean) {
    if (checked) onChange(0, true);
    else onChange(null, false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "1") { e.preventDefault(); if (!noEvidence) onChange(0, false); }
    if (e.key === "2") { e.preventDefault(); if (!noEvidence) onChange(1, false); }
    if (e.key === "3") { e.preventDefault(); if (!noEvidence) onChange(2, false); }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const order: ScoreValue[] = [0, 1, 2];
      const idx = value !== null ? order.indexOf(value) : -1;
      const next = e.key === "ArrowDown" ? Math.min(2, idx + 1) : Math.max(0, idx - 1);
      if (idx === -1) onChange(0, false);
      else onChange(order[next < 0 ? 0 : next], false);
    }
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[18px] shadow-[var(--shadow-sm)]" onKeyDown={onKeyDown}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-[15px] font-semibold tracking-[-.01em]">{crit.title}</h3>
          <p className="text-[12.5px] text-[var(--text-muted)] mt-1">{crit.question}</p>
        </div>
        <span className={cn("text-[11px] font-medium px-2 py-1 rounded-full border tabular-nums", value !== null ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]" : "bg-[var(--surface-sunk)] border-[var(--border)] text-[var(--text-faint)]")}>
          {value !== null ? `${value} / 2` : "— / 2"}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-[12px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1"
        aria-expanded={expanded}
        aria-controls={`${groupId}-rubric`}
      >
        {expanded ? "Hide rubric ▲" : "Show rubric ▾"}
        <span className="text-[11px] text-[var(--text-faint)] font-normal">— {expanded ? "anchors visible" : "tap when scoring"}</span>
      </button>
      <div id={`${groupId}-rubric`} role="radiogroup" aria-labelledby={`${groupId}-label`} className={cn("flex flex-col gap-2 mt-3", noEvidence && "opacity-55")}>
        <span id={`${groupId}-label`} className="sr-only">{crit.title}</span>
        {[0, 1, 2].map((v) => {
          const isSelected = value === v && !noEvidence;
          const scoreClass = v === 0 ? "data-[selected=true]:bg-[var(--score-0-soft)] data-[selected=true]:border-[var(--score-0)]" : v === 1 ? "data-[selected=true]:bg-[var(--score-1-soft)] data-[selected=true]:border-[var(--score-1)]" : "data-[selected=true]:bg-[var(--score-2-soft)] data-[selected=true]:border-[var(--score-2)]";
          const numColor = v === 0 ? "data-[selected=true]:text-[var(--score-0)]" : v === 1 ? "data-[selected=true]:text-[var(--score-1)]" : "data-[selected=true]:text-[var(--score-2)]";
          return (
            <button
              key={v}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={noEvidence}
              data-selected={isSelected}
              data-v={v}
              disabled={noEvidence}
              onClick={() => select(v as ScoreValue)}
              className={cn(
                "grid grid-cols-[26px_1fr] gap-[10px] text-left w-full bg-[var(--surface)] border border-[var(--border)] rounded-[10px] cursor-pointer transition-colors hover:border-[var(--border-strong)] focus-visible:outline-[2px] focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2",
                showAnchor ? "p-[11px] min-h-[64px]" : "p-[12px_14px] min-h-[52px]",
                isSelected && "border-[1.5px]",
                isSelected && (showAnchor ? "p-[10.5px_11.5px]" : "p-[9.5px_10.5px]"),
                scoreClass
              )}
              style={{ opacity: noEvidence ? 0.55 : 1 }}
            >
              <span className={cn("text-[18px] font-semibold tabular-nums leading-[1.15] text-[var(--text-faint)]", numColor)}>{v}</span>
              <span className="flex-1">
                <span className="text-[13px] font-semibold block leading-[1.2]">{v === 0 ? "Below standard" : v === 1 ? "Meets standard" : "Above standard"}</span>
                {showAnchor && <span className="text-[12.5px] leading-[1.45] text-[var(--text-muted)] block mt-0.5">{(crit.anchors as any)[v]}</span>}
              </span>
              {isSelected && showAnchor && <span aria-hidden className="col-span-2 hidden">✓</span>}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 mt-3 text-[12.5px] text-[var(--text-muted)] cursor-pointer">
        <input type="checkbox" checked={noEvidence} onChange={(e) => toggleNoEvidence(e.target.checked)} className="accent-[var(--accent)] w-[15px] h-[15px]" />
        No evidence provided in the application
      </label>
      {noEvidence && <p className="text-[11.5px] text-[var(--text-faint)] mt-1">Score forced to 0 — options disabled.</p>}
    </div>
  );
}
