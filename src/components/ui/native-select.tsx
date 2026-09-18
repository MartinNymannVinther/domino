import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A real <select>, dressed like the 2a input. Used wherever a choice is a
 * short fixed list — a column, a priority, a member — because it works
 * with a keyboard, with touch, with a screen reader and on a phone's own
 * picker, and needs no script to open.
 */
const ARROW =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'><path d='M1 1l4 4 4-4' fill='none' stroke='%238a8479' stroke-width='1.5'/></svg>\")";

function NativeSelect({
  className,
  variant = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { variant?: "default" | "sm" | "xs" }) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "border-input bg-card text-foreground focus-visible:border-ring focus-visible:ring-ring/18 w-full min-w-0 cursor-pointer appearance-none rounded-md border pr-8 pl-3 text-sm transition-colors duration-[120ms] ease-out outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-45",
        variant === "default" && "h-[2.625rem]",
        variant === "sm" && "h-9 text-2sm",
        variant === "xs" && "h-8 rounded-sm text-2sm",
        className,
      )}
      style={{
        backgroundImage: ARROW,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
      }}
      {...props}
    />
  );
}

export { NativeSelect };
