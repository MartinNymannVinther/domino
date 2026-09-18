"use client";

import { useId, useRef } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { outputPortNames, type FlowDocument, type FlowNodeOf } from "@/modules/flow";
import { NumberField, TextAreaField } from "./field-helpers";
import { SchemaEditor } from "./schema-editor";

/**
 * The bricks that write from a prompt or a template. The text is the
 * person's own; what it can pull in is offered as a list, so nobody has
 * to remember an id — choosing a brick's output writes `{{n2.text}}`
 * at the cursor, and the edge follows from the text (references.ts).
 */

function InsertReference({
  doc,
  nodeId,
  onInsert,
}: {
  doc: FlowDocument;
  nodeId: string;
  onInsert: (reference: string) => void;
}) {
  const t = useTranslations("bricks.prompt");
  const id = useId();
  const options = doc.nodes
    .filter((n) => n.id !== nodeId)
    .flatMap((n) =>
      outputPortNames(n).map((port) => ({
        ref: `{{${n.id}.${port}}}`,
        label: `${n.title} · ${port}`,
      })),
    );
  if (options.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("insert")}</Label>
      <NativeSelect
        id={id}
        variant="sm"
        value=""
        onChange={(e) => {
          if (e.target.value) onInsert(e.target.value);
        }}
      >
        <option value="">{t("insertPlaceholder")}</option>
        {options.map((o) => (
          <option key={o.ref} value={o.ref}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      <p className="text-meta text-2sm">{t("insertHelp")}</p>
    </div>
  );
}

function useInsertAt(commit: (next: string) => void, current: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return {
    ref,
    insert: (reference: string) => {
      const area = ref.current;
      const text = area ? area.value : current;
      const at = area ? area.selectionStart : text.length;
      const next = `${text.slice(0, at)}${reference}${text.slice(at)}`;
      commit(next);
    },
  };
}

export function LlmForm({
  node,
  doc,
  onChange,
}: {
  node: FlowNodeOf<"llm">;
  doc: FlowDocument;
  onChange: (config: FlowNodeOf<"llm">["config"]) => void;
}) {
  const t = useTranslations("bricks.prompt");
  const c = node.config;
  const { ref, insert } = useInsertAt((prompt) => onChange({ ...c, prompt }), c.prompt);
  return (
    <>
      <TextAreaField
        label={t("prompt")}
        value={c.prompt}
        onCommit={(prompt) => onChange({ ...c, prompt })}
        placeholder={t("promptPlaceholder")}
        textareaRef={ref}
      />
      <InsertReference doc={doc} nodeId={node.id} onInsert={insert} />
      <ModelSettings
        temperature={c.temperature}
        maxTokens={c.maxTokens}
        onChange={(next) => onChange({ ...c, ...next })}
      />
    </>
  );
}

export function StructuredForm({
  node,
  doc,
  onChange,
}: {
  node: FlowNodeOf<"structured">;
  doc: FlowDocument;
  onChange: (config: FlowNodeOf<"structured">["config"]) => void;
}) {
  const t = useTranslations("bricks.prompt");
  const c = node.config;
  const { ref, insert } = useInsertAt((prompt) => onChange({ ...c, prompt }), c.prompt);
  return (
    <>
      <TextAreaField
        label={t("prompt")}
        value={c.prompt}
        onCommit={(prompt) => onChange({ ...c, prompt })}
        placeholder={t("promptPlaceholder")}
        textareaRef={ref}
      />
      <InsertReference doc={doc} nodeId={node.id} onInsert={insert} />
      <SchemaEditor schema={c.schema} onChange={(schema) => onChange({ ...c, schema })} />
      <ModelSettings
        temperature={c.temperature}
        maxTokens={c.maxTokens}
        onChange={(next) => onChange({ ...c, ...next })}
      />
    </>
  );
}

export function TemplateForm({
  node,
  doc,
  onChange,
}: {
  node: FlowNodeOf<"template">;
  doc: FlowDocument;
  onChange: (config: FlowNodeOf<"template">["config"]) => void;
}) {
  const t = useTranslations("bricks.prompt");
  const c = node.config;
  const { ref, insert } = useInsertAt((template) => onChange({ template }), c.template);
  return (
    <>
      <TextAreaField
        label={t("template")}
        value={c.template}
        onCommit={(template) => onChange({ template })}
        placeholder={t("templatePlaceholder")}
        textareaRef={ref}
      />
      <InsertReference doc={doc} nodeId={node.id} onInsert={insert} />
    </>
  );
}

function ModelSettings({
  temperature,
  maxTokens,
  onChange,
}: {
  temperature: number;
  maxTokens: number;
  onChange: (next: { temperature?: number; maxTokens?: number }) => void;
}) {
  const t = useTranslations("bricks.prompt");
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField
        label={t("temperature")}
        value={temperature}
        min={0}
        max={1}
        step={0.1}
        onCommit={(temperature) => onChange({ temperature })}
      />
      <NumberField
        label={t("maxTokens")}
        value={maxTokens}
        min={1}
        max={8000}
        step={100}
        onCommit={(maxTokens) => onChange({ maxTokens })}
      />
    </div>
  );
}
