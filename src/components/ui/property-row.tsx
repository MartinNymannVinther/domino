import { cn } from "@/lib/utils";

/**
 * A fact about a thing, as one row: the label on the left, the control
 * on the right, every row the same height, so a column of them reads
 * as a table and not as a form. Groups are separated by a hairline.
 */
function PropertyRow({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  /** A word under the row, for what the control cannot say itself. */
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div
      className={cn("grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 py-1", className)}
    >
      <Label htmlFor={htmlFor} className="text-label truncate text-xs font-medium">
        {label}
      </Label>
      <div className="min-w-0">{children}</div>
      {hint && <p className="text-meta col-start-2 mt-1 text-xs">{hint}</p>}
    </div>
  );
}

function PropertyGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "border-hairline flex flex-col px-4 py-2 [&:not(:first-child)]:border-t",
        className,
      )}
    >
      {children}
    </div>
  );
}

export { PropertyGroup, PropertyRow };
