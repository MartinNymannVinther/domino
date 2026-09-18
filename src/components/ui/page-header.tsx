import { cn } from "@/lib/utils";

/**
 * The 2a page opening: an optional kicker over a 33px title, a supporting
 * line, and the page's actions on the right.
 */
function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
  size = "page",
  className,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  size?: "page" | "detail" | "section";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {kicker ? <p className="text-chart-2 text-2sm leading-none font-medium">{kicker}</p> : null}
        <h1
          className={cn(
            "leading-[1.1] font-semibold tracking-[-0.02em]",
            size === "page" && "text-[2.0625rem]",
            size === "detail" && "text-[1.8125rem]",
            size === "section" && "text-[1.625rem]",
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="text-muted-foreground text-reading leading-normal">{subtitle}</p>
        ) : null}
      </div>
      {/* `max-w-full` is load-bearing: `shrink-0` alone lets this box grow to
          its content, and then a `max-w-full` inside it (a tab strip that
          means to scroll sideways) has nothing definite to measure against
          and stretches the page instead. Capped here, the actions wrap or
          scroll inside the header and the document stays viewport wide. */}
      {actions ? (
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export { PageHeader };
