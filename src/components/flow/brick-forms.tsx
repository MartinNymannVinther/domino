"use client";

import { useTranslations } from "next-intl";
import {
  BRANCH_OPS,
  COMBINE_MODES,
  INPUT_KINDS,
  LIMITS,
  OUTPUT_KINDS,
  type FlowNodeOf,
} from "@/modules/flow";
import { NumberField, SelectField, TextField } from "./field-helpers";

/**
 * The settings of the bricks that have no prompt: a few choices each,
 * in plain words. Each form is handed its brick and answers with the
 * whole new config; the panel turns that into a patch.
 */

type FormProps<
  T extends "input" | "document" | "branch" | "loop_start" | "loop_end" | "combine" | "output",
> = {
  node: FlowNodeOf<T>;
  onChange: (config: FlowNodeOf<T>["config"]) => void;
};

export function InputForm({ node, onChange }: FormProps<"input">) {
  const ti = useTranslations("bricks.input");
  const c = node.config;
  return (
    <>
      <SelectField
        label={ti("kind")}
        value={c.kind}
        options={INPUT_KINDS.map((k) => ({ value: k, label: ti(`kinds.${k}`) }))}
        onCommit={(kind) => onChange({ ...c, kind })}
      />
      {c.kind === "list" ? (
        <SelectField
          label={ti("itemKind")}
          value={c.itemKind}
          options={[
            { value: "file", label: ti("itemKinds.file") },
            { value: "text", label: ti("itemKinds.text") },
          ]}
          onCommit={(itemKind) => onChange({ ...c, itemKind })}
        />
      ) : null}
      <TextField
        label={ti("label")}
        value={c.label}
        onCommit={(label) => onChange({ ...c, label })}
      />
      <TextField
        label={ti("hint")}
        value={c.hint}
        onCommit={(hint) => onChange({ ...c, hint })}
        hint={ti("hintHelp")}
      />
    </>
  );
}

export function DocumentForm({ node, onChange }: FormProps<"document">) {
  const td = useTranslations("bricks.document");
  return (
    <NumberField
      label={td("maxChars")}
      value={node.config.maxChars}
      min={100}
      max={LIMITS.documentChars}
      step={1000}
      onCommit={(maxChars) => onChange({ maxChars })}
      hint={td("maxCharsHelp")}
    />
  );
}

export function BranchForm({ node, onChange }: FormProps<"branch">) {
  const tb = useTranslations("bricks.branch");
  const c = node.config.condition;
  const set = (next: Partial<typeof c>) => onChange({ condition: { ...c, ...next } });
  return (
    <>
      <SelectField
        label={tb("op")}
        value={c.op}
        options={BRANCH_OPS.map((op) => ({ value: op, label: tb(`ops.${op}`) }))}
        onCommit={(op) => set({ op })}
      />
      {c.op !== "notEmpty" ? (
        <TextField label={tb("value")} value={c.value} onCommit={(value) => set({ value })} />
      ) : null}
      <TextField
        label={tb("field")}
        value={c.field}
        onCommit={(field) => set({ field })}
        hint={tb("fieldHelp")}
      />
    </>
  );
}

export function LoopForm({ node }: FormProps<"loop_start" | "loop_end">) {
  const tl = useTranslations("bricks.loop");
  return (
    <p className="text-meta text-2sm leading-relaxed">
      {tl(node.type === "loop_start" ? "startHelp" : "endHelp", { loopId: node.config.loopId })}
    </p>
  );
}

export function CombineForm({ node, onChange }: FormProps<"combine">) {
  const tc = useTranslations("bricks.combine");
  const c = node.config;
  return (
    <>
      <SelectField
        label={tc("mode")}
        value={c.mode}
        options={COMBINE_MODES.map((mode) => ({ value: mode, label: tc(`modes.${mode}`) }))}
        onCommit={(mode) => onChange({ ...c, mode })}
        hint={tc(`modeHelp.${c.mode}`)}
      />
      {c.mode === "concat" ? (
        <TextField
          label={tc("separator")}
          value={c.separator.replaceAll("\n", "\\n")}
          onCommit={(separator) => onChange({ ...c, separator: separator.replaceAll("\\n", "\n") })}
          hint={tc("separatorHelp")}
        />
      ) : null}
    </>
  );
}

export function OutputForm({ node, onChange }: FormProps<"output">) {
  const to = useTranslations("bricks.output");
  const c = node.config;
  return (
    <>
      <SelectField
        label={to("kind")}
        value={c.kind}
        options={OUTPUT_KINDS.map((k) => ({ value: k, label: to(`kinds.${k}`) }))}
        onCommit={(kind) => onChange({ ...c, kind })}
        hint={to(`kindHelp.${c.kind}`)}
      />
      <TextField
        label={to("label")}
        value={c.label}
        onCommit={(label) => onChange({ ...c, label })}
      />
    </>
  );
}
