import type { FlowDocument } from "./schema";

/**
 * The example flows: what the start screen offers to begin from, what
 * the demo workspace is seeded with, and what the engine's tests run.
 * Written in the owner's language because they are content, not
 * interface: a person copies one and edits the words.
 *
 * Every one of them validates; tests/flow/examples proves it, so an
 * example can never be the first broken flow a person meets.
 */

const applications: FlowDocument = {
  format: "domino.flow",
  version: 1,
  name: "Ansøgninger til skema",
  description:
    "Læser hver ansøgning i bunken, trækker fem punkter ud af den og samler dem i én tabel.",
  nodes: [
    {
      id: "n1",
      type: "input",
      title: "Ansøgninger",
      config: { kind: "list", itemKind: "file", label: "Ansøgninger", hint: "Upload alle PDF'er" },
    },
    { id: "n2", type: "loop_start", title: "For hver ansøgning", config: { loopId: "l1" } },
    { id: "n3", type: "document", title: "Læs ansøgningen", config: { maxChars: 60000 } },
    {
      id: "n4",
      type: "structured",
      title: "Træk de fem punkter ud",
      config: {
        prompt:
          'Læs ansøgningen herunder og udfyld skemaet. Skriv kort og præcist; hvis noget ikke fremgår, skriv "ikke oplyst".\n\n{{n3.text}}',
        schema: {
          type: "object",
          properties: {
            navn: { type: "string", description: "Ansøgerens fulde navn" },
            uddannelse: { type: "string", description: "Højeste relevante uddannelse" },
            erfaring: { type: "string", description: "Relevant erhvervserfaring, i én sætning" },
            motivation: { type: "string", description: "Hvorfor ansøgeren søger, i én sætning" },
            vurdering: {
              type: "string",
              enum: ["stærk", "mulig", "svag"],
              description: "Hvor godt ansøgningen matcher stillingen",
            },
          },
          required: ["navn", "uddannelse", "erfaring", "motivation", "vurdering"],
        },
        temperature: 0,
        maxTokens: 800,
      },
    },
    { id: "n5", type: "loop_end", title: "Saml punkterne", config: { loopId: "l1" } },
    { id: "n6", type: "output", title: "Skema", config: { kind: "table", label: "Skema" } },
  ],
  edges: [
    { id: "e1", from: { node: "n1", port: "value" }, to: { node: "n2", port: "items" } },
    { id: "e2", from: { node: "n2", port: "item" }, to: { node: "n3", port: "file" } },
    { id: "e3", from: { node: "n3", port: "text" }, to: { node: "n4", port: "n3.text" } },
    { id: "e4", from: { node: "n4", port: "json" }, to: { node: "n5", port: "item" } },
    { id: "e5", from: { node: "n5", port: "items" }, to: { node: "n6", port: "value" } },
  ],
};

const summary: FlowDocument = {
  format: "domino.flow",
  version: 1,
  name: "Sammenfat et dokument",
  description: "Læser ét dokument og skriver en sammenfatning på ti linjer.",
  nodes: [
    {
      id: "n1",
      type: "input",
      title: "Dokument",
      config: { kind: "file", itemKind: "file", label: "Dokument", hint: "PDF, Word eller tekst" },
    },
    { id: "n2", type: "document", title: "Læs dokumentet", config: { maxChars: 60000 } },
    {
      id: "n3",
      type: "llm",
      title: "Skriv sammenfatningen",
      config: {
        prompt:
          "Sammenfat dokumentet herunder på højst ti linjer. Skriv til en kollega, der ikke har læst det: hvad handler det om, hvad er de vigtigste punkter, og er der noget der kræver handling.\n\n{{n2.text}}",
        temperature: 0.2,
        maxTokens: 600,
      },
    },
    {
      id: "n4",
      type: "output",
      title: "Sammenfatning",
      config: { kind: "text", label: "Sammenfatning" },
    },
  ],
  edges: [
    { id: "e1", from: { node: "n1", port: "value" }, to: { node: "n2", port: "file" } },
    { id: "e2", from: { node: "n2", port: "text" }, to: { node: "n3", port: "n2.text" } },
    { id: "e3", from: { node: "n3", port: "text" }, to: { node: "n4", port: "value" } },
  ],
};

const triage: FlowDocument = {
  format: "domino.flow",
  version: 1,
  name: "Sortér en henvendelse",
  description:
    "Læser en henvendelse, finder ud af hvad den handler om og om den haster, og skriver et udkast til svar der passer.",
  nodes: [
    {
      id: "n1",
      type: "input",
      title: "Henvendelse",
      config: {
        kind: "text",
        itemKind: "text",
        label: "Henvendelse",
        hint: "Indsæt mailen som den kom",
      },
    },
    {
      id: "n2",
      type: "structured",
      title: "Hvad handler den om?",
      config: {
        prompt:
          "Læs henvendelsen herunder. Afgør hvilken kategori den hører til, om den haster, og skriv én sætning om hvad afsenderen vil.\n\n{{n1.value}}",
        schema: {
          type: "object",
          properties: {
            kategori: { type: "string", enum: ["klage", "spørgsmål", "bestilling", "andet"] },
            haster: { type: "boolean", description: "Skal den besvares i dag" },
            resume: { type: "string", description: "Hvad afsenderen vil, i én sætning" },
          },
          required: ["kategori", "haster", "resume"],
        },
        temperature: 0,
        maxTokens: 400,
      },
    },
    {
      id: "n3",
      type: "branch",
      title: "Haster den?",
      config: { condition: { op: "equals", field: "haster", value: "true" } },
    },
    {
      id: "n4",
      type: "template",
      title: "Svar der haster",
      config: {
        template:
          "HASTER – {{n3.yes.kategori}}\n\n{{n3.yes.resume}}\n\nSvar afsenderen i dag og bekræft at vi er i gang.",
      },
    },
    {
      id: "n5",
      type: "template",
      title: "Svar der kan vente",
      config: {
        template: "{{n3.no.kategori}}\n\n{{n3.no.resume}}\n\nSvar inden for tre arbejdsdage.",
      },
    },
    {
      id: "n6",
      type: "combine",
      title: "Det ene af svarene",
      config: { mode: "concat", separator: "\n" },
    },
    { id: "n7", type: "output", title: "Svar", config: { kind: "text", label: "Svar" } },
  ],
  edges: [
    { id: "e1", from: { node: "n1", port: "value" }, to: { node: "n2", port: "n1.value" } },
    { id: "e2", from: { node: "n2", port: "json" }, to: { node: "n3", port: "value" } },
    { id: "e3", from: { node: "n3", port: "yes" }, to: { node: "n4", port: "n3.yes" } },
    { id: "e4", from: { node: "n3", port: "no" }, to: { node: "n5", port: "n3.no" } },
    { id: "e5", from: { node: "n4", port: "text" }, to: { node: "n6", port: "a" } },
    { id: "e6", from: { node: "n5", port: "text" }, to: { node: "n6", port: "b" } },
    { id: "e7", from: { node: "n6", port: "text" }, to: { node: "n7", port: "value" } },
  ],
};

export const EXAMPLE_FLOWS: ReadonlyArray<{
  key: "applications" | "summary" | "triage";
  document: FlowDocument;
}> = [
  { key: "applications", document: applications },
  { key: "summary", document: summary },
  { key: "triage", document: triage },
];

export function exampleFlow(key: string): FlowDocument | null {
  return EXAMPLE_FLOWS.find((e) => e.key === key)?.document ?? null;
}
