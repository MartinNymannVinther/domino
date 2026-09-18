"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A list of short values entered one at a time — branch codes, search
 * words — kept as visible chips instead of one comma-separated string.
 * A string forces you to edit blind and to guess whether the separator
 * wants a space; chips make what is stored and what can be removed
 * obvious. Enter and comma both commit, backspace on an empty field
 * removes the last one.
 */
export function ChipInput({
  values,
  onChange,
  placeholder,
  label,
  maxValues = 30,
  maxLength = 60,
  className,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  label: string;
  maxValues?: number;
  maxLength?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const value = raw.trim().replace(/,$/, "").trim();
    if (!value) return;
    if (values.length >= maxValues) return;
    if (values.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, value.slice(0, maxLength)]);
    setDraft("");
  }

  return (
    <div
      className={cn(
        "border-input bg-card focus-within:border-ring focus-within:ring-ring/18 flex flex-wrap items-center gap-1.5 rounded-md border p-1.5 transition-colors focus-within:ring-3",
        className,
      )}
    >
      {values.map((value) => (
        <span
          key={value}
          className="bg-accent text-accent-foreground flex items-center gap-1 rounded-sm py-0.5 pr-1 pl-2 text-2sm font-medium"
        >
          {value}
          <button
            type="button"
            aria-label={`${label}: ${value}`}
            className="hover:text-foreground rounded-xs p-0.5"
            onClick={() => onChange(values.filter((existing) => existing !== value))}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <Input
        value={draft}
        aria-label={label}
        placeholder={values.length === 0 ? placeholder : undefined}
        maxLength={maxLength}
        onChange={(event) => {
          if (event.target.value.endsWith(",")) commit(event.target.value);
          else setDraft(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(draft);
          } else if (event.key === "Backspace" && draft === "" && values.length > 0) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        className="h-7 min-w-32 flex-1 border-0 bg-transparent px-1.5 shadow-none focus-visible:border-0 focus-visible:ring-0"
      />
    </div>
  );
}
