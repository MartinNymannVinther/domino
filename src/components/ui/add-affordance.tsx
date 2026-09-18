import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The place where something is not yet, drawn as the thing to click: a
 * dashed row with the word for what it adds. Where a field is empty this
 * stands in for the field, so an empty card never looks like a form
 * waiting to be filled in, and the way to fill it is never far away.
 */
function AddAffordance({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-input text-meta hover:border-label hover:text-foreground focus-visible:outline-ring flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-sm transition-colors duration-[120ms] outline-none focus-visible:outline-2",
        className,
      )}
    >
      <Plus className="size-3.5 shrink-0" aria-hidden />
      {label}
    </button>
  );
}

export { AddAffordance };
