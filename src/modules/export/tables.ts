/**
 * What a full export contains, and what it deliberately leaves out.
 *
 * The list is written by hand rather than derived from the schema, because
 * "everything in the database" is the wrong answer twice over: it would
 * carry secrets out of the system, and it would silently start including
 * whatever table someone adds next. A new table appears in the export when
 * a person decides it should, which is the same discipline the tenancy
 * checklist asks for.
 *
 * Order matters: it is the order of the tabs in the spreadsheet, and it
 * runs from the things a person recognizes (flows, runs) toward the
 * technical ones (audit trail).
 */

export type ExportTable = {
  /** Database table, from this fixed list and never from user input. */
  table: string;
  /** Tab name in the spreadsheet, and key in the JSON export. */
  sheet: string;
  /** Columns never written out, whatever they contain. */
  redact?: string[];
  /** Column to sort by; falls back to the primary key's insertion order. */
  orderBy?: string;
};

export const EXPORT_TABLES: ExportTable[] = [
  { table: "flows", sheet: "Flows", orderBy: "created_at" },
  // Every version with its whole document: the flows themselves, in the
  // format docs/flow-format.md describes, importable one by one.
  { table: "flow_versions", sheet: "Versioner", orderBy: "flow_id, number" },
  { table: "flow_messages", sheet: "Samtaler", orderBy: "created_at" },
  // The files travel as their extracted text and their metadata. The bytes
  // are a workspace's too, and a later decision gives them their own
  // download; a spreadsheet cell is not the place for a PDF.
  { table: "files", sheet: "Filer", orderBy: "created_at", redact: ["bytes"] },
  { table: "runs", sheet: "Kørsler", orderBy: "created_at" },
  { table: "run_steps", sheet: "Trin", orderBy: "run_id, started_at" },
  { table: "audit_log", sheet: "Revisionsspor", orderBy: "created_at" },
];

/**
 * Left out on purpose:
 *
 * - `ai_calls`: a counter for rate limiting, not something a workspace owns.
 * - `workspace_llm_settings`: the model choice, which holds an encrypted
 *   key; a workspace that leaves gets its data, not its secrets.
 * - Everything Better Auth owns (users, sessions, accounts, passkeys, two
 *   factors, rate limits). Sessions and passkeys are credentials, and the
 *   people are exported as members below rather than as auth rows.
 * - `access_requests` and `access_invitations`: they belong to the
 *   installation, not to any workspace, and describe people who are not
 *   users of it. The application role cannot read them anyway.
 */
export const MEMBERS_SHEET = "Brugere";
