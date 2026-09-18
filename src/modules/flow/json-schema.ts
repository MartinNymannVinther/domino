import { z } from "zod";

/**
 * The JSON Schema a structured brick may declare (docs/flow-format.md):
 * an object of strings, numbers, booleans, enums and arrays of those,
 * with one level of nested objects. Small enough for a form to draw, a
 * non-programmer to fill in, and a model to answer reliably; and small
 * enough to be checked here without a schema engine as a dependency.
 */

const Scalar = z.union([
  z.object({
    type: z.literal("string"),
    description: z.string().max(500).optional(),
    enum: z.array(z.string().min(1).max(120)).min(1).max(50).optional(),
  }),
  z.object({
    type: z.enum(["number", "integer"]),
    description: z.string().max(500).optional(),
  }),
  z.object({ type: z.literal("boolean"), description: z.string().max(500).optional() }),
]);

const PropertyName = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/, "property");

const InnerObject = z.object({
  type: z.literal("object"),
  description: z.string().max(500).optional(),
  properties: z.record(PropertyName, Scalar).refine((p) => Object.keys(p).length <= 40, "size"),
  required: z.array(PropertyName).max(40).optional(),
});

const Property = z.union([
  Scalar,
  InnerObject,
  z.object({
    type: z.literal("array"),
    description: z.string().max(500).optional(),
    items: z.union([Scalar, InnerObject]),
  }),
]);

export const StructuredSchema = z
  .object({
    type: z.literal("object"),
    description: z.string().max(500).optional(),
    properties: z.record(PropertyName, Property).refine((p) => Object.keys(p).length <= 40, "size"),
    required: z.array(PropertyName).max(40).optional(),
  })
  .superRefine((schema, ctx) => {
    for (const name of schema.required ?? []) {
      if (!(name in schema.properties))
        ctx.addIssue({ code: "custom", message: `required names unknown property ${name}` });
    }
  });

export type StructuredSchema = z.infer<typeof StructuredSchema>;
type PropertySchema = z.infer<typeof Property>;

/**
 * Checks a value the model answered with against the brick's schema.
 * Returns the problems in plain words, empty when it conforms; the
 * caller decides whether to ask again or to fail the step. Extra
 * properties are allowed and kept: a model that volunteers a field is
 * not wrong, only chatty.
 */
export function schemaProblems(schema: StructuredSchema, value: unknown, at = "$"): string[] {
  return objectProblems(schema, value, at);
}

function objectProblems(
  schema: { properties: Record<string, PropertySchema>; required?: string[] },
  value: unknown,
  at: string,
): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return [`${at} must be an object`];
  const record = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const name of schema.required ?? []) {
    if (record[name] === undefined || record[name] === null)
      problems.push(`${at}.${name} is missing`);
  }
  for (const [name, property] of Object.entries(schema.properties)) {
    const field = record[name];
    if (field === undefined || field === null) continue;
    problems.push(...propertyProblems(property, field, `${at}.${name}`));
  }
  return problems;
}

function propertyProblems(property: PropertySchema, value: unknown, at: string): string[] {
  switch (property.type) {
    case "string":
      if (typeof value !== "string") return [`${at} must be text`];
      if (property.enum && !property.enum.includes(value))
        return [`${at} must be one of ${property.enum.join(", ")}`];
      return [];
    case "number":
      return typeof value === "number" && Number.isFinite(value) ? [] : [`${at} must be a number`];
    case "integer":
      return Number.isInteger(value) ? [] : [`${at} must be a whole number`];
    case "boolean":
      return typeof value === "boolean" ? [] : [`${at} must be true or false`];
    case "object":
      return objectProblems(property, value, at);
    case "array":
      if (!Array.isArray(value)) return [`${at} must be a list`];
      return value.flatMap((item, i) => propertyProblems(property.items, item, `${at}[${i}]`));
  }
}

/** The property names, in declared order: the columns of a table output. */
export function schemaColumns(schema: StructuredSchema): string[] {
  return Object.keys(schema.properties);
}
