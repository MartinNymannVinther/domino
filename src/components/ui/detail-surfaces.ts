/**
 * The two surfaces of a detail page — a card's, an epic's, a feature's:
 * the reading surface on the left, sections divided by hairlines, and
 * the property panel on the right. One definition, so the two pages
 * stay the same page in two sizes.
 */
export const surface =
  "border-border bg-card divide-hairline flex min-w-0 flex-col divide-y rounded-xl border shadow-[var(--surface-shadow)] [&>*]:px-5 [&>*]:py-4";

export const panel =
  "border-border bg-card flex min-w-0 flex-col rounded-xl border shadow-[var(--surface-shadow)]";
