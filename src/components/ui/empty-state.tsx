import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The 2a empty state: no icon and no centering. A title, an explanation and
 * the action that fills the space, left aligned inside the card that would
 * otherwise hold the content.
 */
function EmptyState({
  title,
  hint,
  action,
  variant = "panel",
  className,
}: {
  title: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
  /** `inline` drops the card, for use inside one that already exists. */
  variant?: "panel" | "inline";
  className?: string;
}) {
  const body = (
    <div data-slot="empty-state" className={cn("flex flex-col items-start gap-2", className)}>
      <p className="text-base font-semibold">{title}</p>
      {hint ? (
        <p className="text-muted-foreground max-w-prose text-2sm leading-relaxed text-pretty">
          {hint}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );

  if (variant === "inline") return body;
  return (
    <Card>
      <CardContent className="py-1">{body}</CardContent>
    </Card>
  );
}

export { EmptyState };
