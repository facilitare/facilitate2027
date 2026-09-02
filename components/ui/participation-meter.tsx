export function ParticipationMeter({ value }: { value: number | null }) {
  const v = Math.max(0, Math.min(5, value ?? 0));
  return (
    <div>
      <div className="flex gap-1 my-1" role="img" aria-label={`Self-reported participation level: ${v} out of 5`}>
        {Array.from({length:5}).map((_,i)=> <i key={i} className={`h-2 flex-1 rounded-[3px] border ${i < v ? "bg-[var(--accent)] border-[var(--accent)]" : "bg-[var(--surface-sunk)] border-[var(--border)]"}`} />)}
      </div>
      <div className="text-[12px] text-[var(--text-faint)]">{v} of 5 — self-reported by the applicant</div>
    </div>
  );
}
