# The tool card for haij.dk

The copy for Domino's card on haij.dk, in both languages, with the entry
proposed for the site's `tools.ts`. It belongs in the haij.dk repository;
it is written here with the finish (CLAUDE.md, wave 5) so it travels with
the release it describes. Dogma seven decides when it goes up: not before
a real pile has run.

## Dansk

**Domino** — Stil brikkerne op. Skub til den første.

En visuel flow-bygger til AI-arbejdsgange, for folk der ikke programmerer.
Beskriv hvad du vil have — "læs de to hundrede ansøgninger, træk fem
punkter ud af hver og sæt dem i en tabel" — og modellen stiller
brikkerne op: input, sprogmodel, skema, dokument, hvis/ellers, løkke,
kombinér, skabelon, output. Ret i det på lærredet eller i samtalen, test
på ét eksempel, kør hele bunken og se det ske brik for brik. Et flow er
én fil, du kan eksportere, importere og lægge under versionsstyring.
Kører hos Mistral i EU eller på din egen maskine med Ollama.

## English

**Domino** — Line the bricks up. Push the first one.

A visual flow builder for AI workflows, for people who do not program.
Say what you want — "read the two hundred applications, pull five points
out of each and put them in a table" — and the model lines up the
bricks: input, language model, schema, document, if/else, loop, combine,
template, output. Change it on the canvas or in the conversation, test
on one example, run the whole pile and watch it happen brick by brick. A
flow is one file you can export, import and keep under version control.
Runs at Mistral in the EU or on your own machine with Ollama.

## The entry

```ts
{
  slug: "domino",
  name: "Domino",
  tagline: { da: "Stil brikkerne op. Skub til den første.", en: "Line the bricks up. Push the first one." },
  url: "https://domino.haij.dk",
  repo: "https://github.com/MartinNymannVinther/domino",
  license: "AGPL-3.0",
  status: "beta",
  selfHost: true,
  ai: { providers: ["mistral-eu", "ollama"], decides: "human" },
}
```
