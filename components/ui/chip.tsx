import { cn } from "@/lib/utils";
export function Chip({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center px-[10px] py-[5px] rounded-full text-[12px] bg-[var(--surface-sunk)] border border-[var(--border)] text-[var(--text)]", className)} {...props} />;
}
