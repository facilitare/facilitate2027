import { cn } from "@/lib/utils";
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[14px] p-8 text-center">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {description && <p className="text-[13px] text-[var(--text-muted)] mt-2 max-w-[60ch] mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
