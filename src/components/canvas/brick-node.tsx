"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { PlayIcon } from "lucide-react";
import { kindLabel } from "@/modules/flow";
import { testableBrick } from "@/modules/runs/testable";
import { cn } from "@/lib/utils";
import { useCanvasActions } from "./canvas-actions";
import { hasReferenceHandle, REFERENCE_HANDLE, type BrickNode as BrickNodeType } from "./graph";

/**
 * One brick on the canvas, in the 2a tokens: a paper card with the type
 * as a kicker, the title, and a row per port with its handle on the
 * edge. A prompt brick has one more target, marked +, that takes a new
 * reference when a connection is dropped on it. A proposal's marks
 * colour the card (added, changed, removed) and a warning shows as a
 * small badge; the panel says what it is.
 */
const PORT_TOP = 64;
const PORT_ROW = 22;

function BrickNodeView({ data, selected }: NodeProps<BrickNodeType>) {
  const t = useTranslations("bricks");
  const { brick, inputs, outputs, problems, mark } = data;
  const warnings = problems.filter((p) => p.severity === "warning");
  const errors = problems.filter((p) => p.severity === "error");
  const withReference = hasReferenceHandle(brick.type);
  const rows = Math.max(inputs.length + (withReference ? 1 : 0), outputs.length, 1);
  const { onTest } = useCanvasActions();
  const testable = Boolean(onTest) && testableBrick(brick.type);

  return (
    <div
      className={cn(
        "bg-card text-card-foreground border-border relative w-[240px] rounded-[var(--radius)] border text-sm shadow-[var(--surface-shadow)] transition-[box-shadow,opacity] duration-[120ms]",
        selected && "ring-ring ring-2 ring-offset-2 ring-offset-[var(--background)]",
        mark === "added" && "border-primary bg-success-tint",
        mark === "changed" && "border-chart-4 bg-warning-tint",
        mark === "removed" && "border-dashed opacity-50",
        brick.type === "input" && "border-l-4 border-l-chart-2",
        brick.type === "output" && "border-l-4 border-l-primary",
      )}
      style={{ minHeight: PORT_TOP + rows * PORT_ROW }}
      title={problems.map((p) => p.message).join("\n") || undefined}
    >
      <div className="flex flex-col" style={{ height: PORT_TOP }}>
        <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
          <p className="text-label text-[11px] leading-none font-medium tracking-[0.04em] uppercase">
            {t(`types.${brick.type}`)}
          </p>
          <span className="flex items-center gap-1">
            {warnings.length + errors.length > 0 ? (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] leading-4 font-semibold",
                  errors.length ? "bg-destructive text-card" : "bg-warning-tint text-warning",
                )}
                aria-label={t("hasProblems", { count: warnings.length + errors.length })}
              >
                {warnings.length + errors.length}
              </span>
            ) : null}
            {testable ? (
              <button
                type="button"
                className="nodrag text-primary hover:bg-accent focus-visible:outline-ring -my-1 -mr-1 flex size-6 items-center justify-center rounded-md focus-visible:outline-2"
                aria-label={t("testBrick", { title: brick.title })}
                title={t("testBrick", { title: brick.title })}
                onClick={(event) => {
                  event.stopPropagation();
                  onTest?.(brick.id);
                }}
              >
                <PlayIcon className="size-3.5" />
              </button>
            ) : null}
          </span>
        </div>
        <p className="truncate px-3 pt-1 leading-snug font-semibold">{brick.title}</p>
      </div>

      {inputs.map((port) => (
        <div key={port.name} className="relative" style={{ height: PORT_ROW }}>
          <Handle
            type="target"
            position={Position.Left}
            id={port.name}
            isConnectable={!port.connected}
            className={cn(
              "!border-card !size-2.5 !border-2",
              port.connected ? "!bg-primary" : port.required ? "!bg-chart-4" : "!bg-chart-3",
            )}
            style={{ top: PORT_ROW / 2 }}
          />
          <span className="text-meta absolute left-3 text-[11px] leading-[22px]">
            {port.name}
            {port.kind ? <span className="text-label"> · {kindLabel(port.kind)}</span> : null}
          </span>
        </div>
      ))}
      {withReference ? (
        <div className="relative" style={{ height: PORT_ROW }}>
          <Handle
            type="target"
            position={Position.Left}
            id={REFERENCE_HANDLE}
            className="!border-card !bg-chart-3 !size-2.5 !border-2"
            style={{ top: PORT_ROW / 2 }}
          />
          <span className="text-label absolute left-3 text-[11px] leading-[22px]">
            + {t("dropReference")}
          </span>
        </div>
      ) : null}

      {outputs.map((port, i) => (
        <Handle
          key={port.name}
          type="source"
          position={Position.Right}
          id={port.name}
          className="!border-card !bg-primary !size-2.5 !border-2"
          style={{ top: PORT_TOP + i * PORT_ROW + PORT_ROW / 2 }}
        />
      ))}
      {outputs.map((port, i) => (
        <span
          key={port.name}
          className="text-meta absolute right-3 text-[11px] leading-[22px]"
          style={{ top: PORT_TOP + i * PORT_ROW }}
        >
          {port.name}
          {port.kind ? <span className="text-label"> · {kindLabel(port.kind)}</span> : null}
        </span>
      ))}
    </div>
  );
}

export const BrickNode = memo(BrickNodeView);
