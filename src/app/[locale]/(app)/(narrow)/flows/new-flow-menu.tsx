"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EXAMPLE_FLOWS } from "@/modules/flow";
import { createFlowAction } from "@/modules/flow/actions";
import { useRouter } from "@/i18n/navigation";

/**
 * A new flow: from one of the examples, or the smallest one that runs.
 * Each is a document stored as version 1; the canvas opens on it.
 */
export function NewFlowMenu() {
  const t = useTranslations("flows.new");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const create = (input: { from: "blank" } | { from: "example"; key: string }) =>
    startTransition(async () => {
      const result = await createFlowAction(input);
      if (!result.ok) {
        toast.error(t("failed"));
        return;
      }
      router.push(`/flows/${result.data.flowId}`);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" size="sm" variant="outline" disabled={pending}>
            <PlusIcon data-icon="inline-start" />
            {t("button")}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("examples")}</DropdownMenuLabel>
          {EXAMPLE_FLOWS.map((example) => (
            <DropdownMenuItem
              key={example.key}
              onClick={() => create({ from: "example", key: example.key })}
            >
              <div className="flex flex-col gap-0.5">
                <span>{example.document.name}</span>
                <span className="text-meta line-clamp-2 text-xs">
                  {example.document.description}
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => create({ from: "blank" })}>{t("blank")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
