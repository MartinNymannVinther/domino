import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type Href = React.ComponentProps<typeof Link>["href"];

const track =
  "bg-secondary border-border inline-flex shrink-0 items-center gap-0.5 rounded-md border p-1";
export { track as segmentedTrack };

const segment = (active: boolean) =>
  cn(
    "rounded-sm px-3 py-1.5 text-2sm whitespace-nowrap transition-colors duration-[120ms] ease-out",
    active
      ? "bg-card text-foreground shadow-[var(--surface-shadow)] font-semibold"
      : "text-meta hover:text-foreground",
  );
export { segment as segmentedSegment };

/**
 * The 2a segmented filter: one track on the secondary ground where the active
 * segment lifts onto the card color. Server friendly - every segment is a link.
 */
function SegmentedFilter({
  items,
  trailing,
  className,
}: {
  items: Array<{ key: string; label: React.ReactNode; href: Href; active: boolean }>;
  /** Last on the track, for something that is not a link — a menu trigger. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(track, className)}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "true" : undefined}
          className={segment(item.active)}
        >
          {item.label}
        </Link>
      ))}
      {trailing}
    </div>
  );
}

/**
 * The same track for a choice that stays on the page: one radio group of
 * buttons, for a way of looking rather than a place to go.
 */
function SegmentedChoice<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: React.ReactNode }>;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn(track, className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            segment(option.value === value),
            "focus-visible:outline-ring outline-none focus-visible:outline-2",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export { SegmentedChoice, SegmentedFilter };
