"use client";

import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { StructuredSchema } from "@/modules/flow";
import { useDraft } from "./field-helpers";

/**
 * The schema of a structured brick as a form: one row per field with a
 * name, a type, whether it must be filled, and for a choice the options.
 * This covers the schema a person writes by hand; what the model
 * proposes may be richer (a nested object, a list of objects), and such
 * a field is shown as what it is and left alone rather than flattened.
 */

type Property = StructuredSchema["properties"][string];
type FieldType = "string" | "number" | "integer" | "boolean" | "enum";

function typeOf(property: Property): FieldType | "advanced" {
  if (property.type === "string") return property.enum ? "enum" : "string";
  if (property.type === "number" || property.type === "integer" || property.type === "boolean")
    return property.type;
  return "advanced";
}

function propertyFor(type: FieldType, previous: Property): Property {
  const description = "description" in previous ? previous.description : undefined;
  switch (type) {
    case "enum":
      return { type: "string", description, enum: ["a", "b"] };
    case "string":
      return { type: "string", description };
    default:
      return { type, description };
  }
}

export function SchemaEditor({
  schema,
  onChange,
}: {
  schema: StructuredSchema;
  onChange: (next: StructuredSchema) => void;
}) {
  const t = useTranslations("bricks.schema");
  const names = Object.keys(schema.properties);
  const required = new Set(schema.required ?? []);

  const rename = (from: string, to: string) => {
    const clean = to
      .trim()
      .replace(/[^A-Za-z0-9_]/g, "_")
      .replace(/^[^A-Za-z]+/, "");
    if (!clean || clean === from || clean in schema.properties) return;
    const properties: StructuredSchema["properties"] = {};
    for (const name of names) properties[name === from ? clean : name] = schema.properties[name]!;
    onChange({
      ...schema,
      properties,
      required: [...required].map((n) => (n === from ? clean : n)),
    });
  };
  const setProperty = (name: string, property: Property) =>
    onChange({ ...schema, properties: { ...schema.properties, [name]: property } });
  const remove = (name: string) => {
    const properties = { ...schema.properties };
    delete properties[name];
    onChange({ ...schema, properties, required: [...required].filter((n) => n !== name) });
  };
  const add = () => {
    let n = names.length + 1;
    while (`felt${n}` in schema.properties) n += 1;
    onChange({ ...schema, properties: { ...schema.properties, [`felt${n}`]: { type: "string" } } });
  };
  const toggleRequired = (name: string) => {
    const next = new Set(required);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...schema, required: [...next] });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{t("title")}</p>
      <p className="text-meta text-2sm">{t("help")}</p>
      <ul className="flex flex-col gap-2">
        {names.map((name) => (
          <SchemaRow
            key={name}
            name={name}
            property={schema.properties[name]!}
            required={required.has(name)}
            onRename={(to) => rename(name, to)}
            onChange={(p) => setProperty(name, p)}
            onRemove={() => remove(name)}
            onToggleRequired={() => toggleRequired(name)}
          />
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={add}>
        {t("add")}
      </Button>
    </div>
  );
}

function SchemaRow({
  name,
  property,
  required,
  onRename,
  onChange,
  onRemove,
  onToggleRequired,
}: {
  name: string;
  property: Property;
  required: boolean;
  onRename: (to: string) => void;
  onChange: (p: Property) => void;
  onRemove: () => void;
  onToggleRequired: () => void;
}) {
  const t = useTranslations("bricks.schema");
  const nameDraft = useDraft(name, onRename);
  const type = typeOf(property);
  const options = property.type === "string" ? (property.enum ?? []) : [];
  const optionsDraft = useDraft(options.join(", "), (next) => {
    const enumValues = next
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (enumValues.length && property.type === "string")
      onChange({ ...property, enum: enumValues });
  });
  const descriptionDraft = useDraft(
    "description" in property ? (property.description ?? "") : "",
    (description) => onChange({ ...property, description: description || undefined } as Property),
  );

  return (
    <li className="border-border flex flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label={t("name")}
          value={nameDraft.draft}
          onChange={(e) => nameDraft.setDraft(e.target.value)}
          onBlur={nameDraft.commit}
          className="h-8 text-2sm"
        />
        <NativeSelect
          aria-label={t("type")}
          variant="xs"
          value={type}
          disabled={type === "advanced"}
          onChange={(e) => onChange(propertyFor(e.target.value as FieldType, property))}
        >
          {(["string", "number", "integer", "boolean", "enum"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`types.${k}`)}
            </option>
          ))}
          {type === "advanced" ? <option value="advanced">{t("types.advanced")}</option> : null}
        </NativeSelect>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t("remove")}
          onClick={onRemove}
        >
          <Trash2Icon />
        </Button>
      </div>
      {type === "enum" ? (
        <Input
          aria-label={t("options")}
          placeholder={t("optionsPlaceholder")}
          value={optionsDraft.draft}
          onChange={(e) => optionsDraft.setDraft(e.target.value)}
          onBlur={optionsDraft.commit}
          className="h-8 text-2sm"
        />
      ) : null}
      <Input
        aria-label={t("description")}
        placeholder={t("descriptionPlaceholder")}
        value={descriptionDraft.draft}
        onChange={(e) => descriptionDraft.setDraft(e.target.value)}
        onBlur={descriptionDraft.commit}
        className="h-8 text-2sm"
      />
      <label className="text-2sm flex items-center gap-2">
        <input type="checkbox" checked={required} onChange={onToggleRequired} />
        {t("required")}
      </label>
    </li>
  );
}
