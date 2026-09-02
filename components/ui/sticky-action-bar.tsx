import { cn } from "@/lib/utils";
export function StickyActionBar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("sticky bottom-0 bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-[14px] flex items-center gap-3 flex-wrap shadow-[var(--shadow-md)]", className)} {...props} />;
}
