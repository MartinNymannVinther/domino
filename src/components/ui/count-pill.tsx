/** A small count that wants attention, rendered the same wherever it sits. */
export function CountPill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="bg-primary text-primary-foreground ml-2 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-semibold tabular-nums">
      {count}
    </span>
  );
}
