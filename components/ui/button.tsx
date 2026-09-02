import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "destructive";
type Size = "default" | "sm";

export function Button({ variant="primary", size="default", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const base = "inline-flex items-center justify-center rounded-[8px] font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed";
  const variants: Record<Variant,string> = {
    primary: "bg-[var(--accent)] text-[var(--accent-text)] hover:bg-[var(--accent-hover)]",
    ghost: "bg-transparent border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-sunk)]",
    destructive: "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]",
  };
  const sizes: Record<Size,string> = { default: "h-10 px-4 text-[13.5px]", sm: "h-8 px-3 text-[12.5px]" };
  return <button className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
