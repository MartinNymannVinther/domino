"use client";

import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type FlowDocument, type NodeType, type PatchOp } from "@/modules/flow";
import { newBrickOps } from "./brick-defaults";

/**
 * The palette: the nine bricks, and not one more (CLAUDE.md). A brick
 * is added after the selected one when there is one, connected where
 * the kinds allow; a loop arrives as its pair.
 */
const PALETTE: NodeType[] = [
  "input",
  "document",
  "llm",
  "structured",
  "template",
  "branch",
  "loop_start",
  "combine",
  "output",
];

export function AddBrickMenu({
  doc,
  selectedId,
  onAdd,
  disabled,
}: {
  doc: FlowDocument;
  selectedId: string | null;
  onAdd: (ops: PatchOp[], message: string, newId: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("flow.add");
  const tb = useTranslations("bricks");
  const after = selectedId && doc.nodes.some((n) => n.id === selectedId) ? selectedId : null;
  const afterTitle = after ? doc.nodes.find((n) => n.id === after)?.title : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" size="sm" disabled={disabled}>
            <PlusIcon data-icon="inline-start" />
            {t("button")}
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {afterTitle ? t("after", { title: afterTitle }) : t("loose")}
          </DropdownMenuLabel>
          {PALETTE.map((type) => (
            <DropdownMenuItem
              key={type}
              onClick={() => {
                const ops = newBrickOps(
                  doc,
                  type,
                  { title: tb(`defaults.${type}`), endTitle: tb("defaults.loop_end") },
                  after,
                );
                const first = ops[0];
                const newId = first?.op === "addNode" ? first.node.id : "";
                onAdd(ops, t("message", { type: tb(`types.${type}`) }), newId);
              }}
            >
              <div className="flex flex-col gap-0.5">
                <span>{tb(`types.${type}`)}</span>
                <span className="text-meta text-xs">{tb(`about.${type}`)}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
