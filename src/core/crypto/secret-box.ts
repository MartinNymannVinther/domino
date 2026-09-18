import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { env } from "@/core/env";

/**
 * Symmetric encryption for the few secrets a workspace hands us — today
 * only its own model API key. AES-256-GCM, so a tampered ciphertext fails
 * to open rather than opening into something else.
 *
 * The key is derived from BETTER_AUTH_SECRET rather than a second
 * environment variable. The trade-off is written down in docs/adr/0006:
 * one secret to protect and no extra step in the deploy guide, at the
 * price that rotating BETTER_AUTH_SECRET makes stored keys unreadable.
 * Unreadable is handled as absent everywhere it matters, so a rotation
 * costs a re-entry of the key, never a broken installation.
 */

const VERSION = "v2";
const INFO = "domino:secret-box:v1";

function key(): Buffer {
  // HKDF with a fixed info string: the auth secret keeps its own job, and
  // this derivation cannot be replayed against another use of it.
  return Buffer.from(hkdfSync("sha256", env.BETTER_AUTH_SECRET, "", INFO, 32));
}

/**
 * Returns a self-describing string: v2.iv.tag.ciphertext, all base64url.
 *
 * `owner` is bound into the ciphertext as additional authenticated data,
 * so a sealed value only opens for the workspace it was sealed for.
 * Without it the column is portable: anyone who can write the database
 * could move workspace A's sealed key into workspace B's row and have
 * B's model calls billed to A, with the encryption itself none the wiser.
 */
export function sealSecret(plain: string, owner: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(owner, "utf8"));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/**
 * Null when the value cannot be opened — wrong key after a rotation, a
 * truncated column, a format we no longer speak. Callers treat null as
 * "no key stored", which degrades to the installation's own configuration
 * instead of failing the request.
 */
export function openSecret(sealed: string | null | undefined, owner: string): string | null {
  if (!sealed) return null;
  const parts = sealed.split(".");
  if (parts.length !== 4) return null;
  const [version, iv, tag, body] = parts as [string, string, string, string];
  // v1 predates the owner binding and is read for as long as installations
  // may still hold one; anything sealed from now on is v2 and bound.
  if (version !== VERSION && version !== "v1") return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    if (version === VERSION) decipher.setAAD(Buffer.from(owner, "utf8"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(body, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/** The last four characters, for a UI that must prove a key without showing it. */
export function secretHint(plain: string): string {
  return plain.length <= 4 ? "····" : `····${plain.slice(-4)}`;
}
