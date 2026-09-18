import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-[2.625rem] w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 text-base transition-colors duration-[120ms] ease-out outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-label focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/18 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-destructive md:text-sm",
        // A date field has one right width: dd.mm.yyyy plus the browser's
        // own picker button. In a flex row it would otherwise shrink and
        // cut the year off, which is the half nobody can guess.
        type === "date" && "w-[9.5rem] shrink-0 grow-0 basis-auto px-2.5",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
