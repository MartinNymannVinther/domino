"use client";

import * as React from "react";
import { TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * A table row you can click anywhere on.
 *
 * The obvious way to do this is a link inside the first cell with an
 * `::after` stretched over the row, anchored to `position: relative` on
 * the `<tr>`. Safari does not honour position on table rows, so every
 * row's overlay resolves against a shared ancestor instead, they stack,
 * and the last row in the DOM swallows every click in the table — the
 * whole list becomes one link to its own bottom entry.
 *
 * So the row handles the click itself, and the first cell keeps a real
 * anchor. The anchor carries the semantics: keyboard focus, the URL in
 * the status bar, open-in-new-tab, screen readers. This handler is only
 * the convenience of a bigger target, and it stands aside for anything
 * else that is clickable, for a modifier-click, and for a click that ends
 * a text selection.
 */
export function LinkedRow({
  href,
  className,
  children,
  ...props
}: React.ComponentProps<typeof TableRow> & { href: string }) {
  const router = useRouter();

  function handleClick(event: React.MouseEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (
      event.target instanceof Element &&
      event.target.closest("a, button, input, select, textarea, label, [role='menuitem']")
    ) {
      return;
    }
    if (window.getSelection()?.toString()) return;
    router.push(href);
  }

  return (
    <TableRow className={cn("cursor-pointer", className)} onClick={handleClick} {...props}>
      {children}
    </TableRow>
  );
}
