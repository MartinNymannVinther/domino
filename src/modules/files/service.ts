import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { files } from "@/core/db/schema";
import { withOrgContext, type OrgContext } from "@/core/db/tenant";
import type { FileRef } from "@/modules/flow";
import { ACCEPTED_MIMES, extractText } from "./extract";

/**
 * Files in the database, never on disk (docs/adr/0011): the bytes, the
 * name, and the text pulled out at upload. Every read and write runs in
 * the workspace context; the bytes are selected by name where they are
 * needed and nowhere else.
 */

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 200;

export type StoredFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
  hasText: boolean;
  extractError: string | null;
  createdAt: Date;
};

export type UploadResult =
  | { ok: true; file: StoredFile; ref: FileRef }
  | { ok: false; reason: "tooBig" | "unsupported" | "empty" };

export async function storeFile(
  ctx: OrgContext,
  flowId: string | null,
  input: { name: string; mime: string; bytes: Buffer },
): Promise<UploadResult> {
  if (input.bytes.length === 0) return { ok: false, reason: "empty" };
  if (input.bytes.length > MAX_FILE_BYTES) return { ok: false, reason: "tooBig" };
  if (!ACCEPTED_MIMES.has(input.mime)) return { ok: false, reason: "unsupported" };
  const name = input.name.trim().slice(0, 255) || "fil";
  const extracted = await extractText(input.mime, input.bytes);
  const [row] = await withOrgContext(ctx, (tx) =>
    tx
      .insert(files)
      .values({
        orgId: ctx.orgId,
        flowId,
        name,
        mime: input.mime,
        size: input.bytes.length,
        bytes: input.bytes,
        text: "text" in extracted ? extracted.text : null,
        extractError: "error" in extracted ? extracted.error : null,
        createdBy: ctx.userId,
      })
      .returning({ id: files.id, createdAt: files.createdAt }),
  );
  const file: StoredFile = {
    id: row!.id,
    name,
    mime: input.mime,
    size: input.bytes.length,
    hasText: "text" in extracted,
    extractError: "error" in extracted ? extracted.error : null,
    createdAt: row!.createdAt,
  };
  return { ok: true, file, ref: { fileId: file.id, name, mime: input.mime } };
}

/** What the document brick reads: the text, or why there is none. */
export async function readFileText(
  ctx: OrgContext,
  fileId: string,
): Promise<{ text: string } | { error: string }> {
  const [row] = await withOrgContext(ctx, (tx) =>
    tx
      .select({ text: files.text, extractError: files.extractError })
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1),
  );
  if (!row) return { error: "the file is not in this workspace" };
  if (row.text === null) return { error: row.extractError ?? "no text was extracted" };
  return { text: row.text };
}

/** The files a flow has been given, newest first, without their bytes. */
export async function listFiles(ctx: OrgContext, flowId: string): Promise<StoredFile[]> {
  return withOrgContext(ctx, async (tx) => {
    const rows = await tx
      .select({
        id: files.id,
        name: files.name,
        mime: files.mime,
        size: files.size,
        hasText: sql<boolean>`${files.text} is not null`,
        extractError: files.extractError,
        createdAt: files.createdAt,
      })
      .from(files)
      .where(and(eq(files.flowId, flowId)))
      .orderBy(desc(files.createdAt));
    return rows;
  });
}

/** Every ref in a run's input must be a file this workspace holds. */
export async function filesExist(ctx: OrgContext, fileIds: string[]): Promise<boolean> {
  if (fileIds.length === 0) return true;
  const wanted = [...new Set(fileIds)];
  const rows = await withOrgContext(ctx, (tx) =>
    tx.select({ id: files.id }).from(files).where(inArray(files.id, wanted)),
  );
  return rows.length === wanted.length;
}

export async function deleteFile(ctx: OrgContext, fileId: string): Promise<boolean> {
  const rows = await withOrgContext(ctx, (tx) =>
    tx.delete(files).where(eq(files.id, fileId)).returning({ id: files.id }),
  );
  return rows.length > 0;
}
