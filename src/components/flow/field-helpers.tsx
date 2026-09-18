"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The panel's fields. Text is committed when the person leaves the
 * field, so a prompt being typed does not become forty versions; a
 * choice is committed as it is made. When a new version arrives from
 * outside, the draft follows it.
 */

export function useDraft<T>(value: T, onCommit: (next: T) => void) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // A new value from outside replaces the draft, decided during render
  // rather than in an effect so the field never shows the old text first.
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return { draft, setDraft, commit };
}

export function TextField({
  label,
  value,
  onCommit,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  const id = useId();
  const { draft, setDraft, commit } = useDraft(value, onCommit);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {hint ? <p className="text-meta text-2sm">{hint}</p> : null}
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onCommit,
  hint,
  rows = 10,
  placeholder,
  textareaRef,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  hint?: string;
  rows?: number;
  placeholder?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const id = useId();
  const { draft, setDraft, commit } = useDraft(value, onCommit);
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        ref={textareaRef}
        value={draft}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className="font-mono text-2sm leading-relaxed"
      />
      {hint ? <p className="text-meta text-2sm">{hint}</p> : null}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  onCommit: (next: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: string;
}) {
  const id = useId();
  const { draft, setDraft, commit } = useDraft(String(value), (next) => {
    const n = Number(next);
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
  });
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
      {hint ? <p className="text-meta text-2sm">{hint}</p> : null}
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onCommit,
  hint,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onCommit: (next: T) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onCommit(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
      {hint ? <p className="text-meta text-2sm">{hint}</p> : null}
    </div>
  );
}
