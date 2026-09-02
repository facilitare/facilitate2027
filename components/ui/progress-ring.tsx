export function ProgressRing({ value, max }: { value: number; max: number }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  const r = 18; const c = 2 * Math.PI * r; const off = c - (pct/100)*c;
  return (
    <div className="relative w-[44px] h-[44px] grid place-items-center">
      <svg width={44} height={44} viewBox="0 0 44 44" className="-rotate-90">
        <circle cx={22} cy={22} r={r} fill="none" stroke="var(--border)" strokeWidth={4} />
        <circle cx={22} cy={22} r={r} fill="none" stroke="var(--accent)" strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <span className="absolute text-[11px] font-medium tabular-nums">{pct}%</span>
    </div>
  );
}
