import { cn } from "@/lib/utils";
const map: Record<string,string> = {
  craft: "text-[var(--craft)] bg-[color-mix(in_srgb,var(--craft)_14%,transparent)]",
  clarity: "text-[var(--clarity)] bg-[color-mix(in_srgb,var(--clarity)_14%,transparent)]",
  change: "text-[var(--change)] bg-[color-mix(in_srgb,var(--change)_14%,transparent)]",
  challenge: "text-[var(--challenge)] bg-[color-mix(in_srgb,var(--challenge)_14%,transparent)]",
};
export function ThemeBadge({ theme, className }: { theme: string; className?: string }) {
  const k = theme?.toLowerCase() || "craft";
  return <span className={cn("inline-flex items-center px-[9px] py-[4px] rounded-full text-[10.5px] font-semibold tracking-[.06em] uppercase", map[k]||map.craft, className)}>{theme}</span>;
}
