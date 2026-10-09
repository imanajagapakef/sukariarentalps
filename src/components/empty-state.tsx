import { Button } from "@/components/ui/button";
import { CircleDashed } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="grid place-items-center gap-4 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center transition-all duration-300 hover:border-primary/40">
      <div className="grid size-16 place-items-center rounded-full bg-primary/10 text-primary">
        <CircleDashed className="size-8" />
      </div>
      <p className="font-display text-xl uppercase">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && (
        <Button onClick={action.onClick} variant="secondary">
          {action.label}
        </Button>
      )}
    </div>
  );
}
