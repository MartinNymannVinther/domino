// Loaded before anything touches @/core/env: a standalone script gets no
// help from Next.js, which normally reads .env for us.
import "dotenv/config";

import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";

/**
 * Sets a password on an existing account.
 *
 *     pnpm script scripts/set-password.ts <email>          # spørger, uden ekko
 *     ... | pnpm script scripts/set-password.ts <email>    # læser fra stdin
 *
 * For the one situation that has no way out from inside the application: a
 * user who signs in only with a passkey, and who now needs to reach the
 * same account from a different origin. A passkey is bound to the origin it
 * was created for, by design, so moving an installation from localhost to a
 * real domain locks a passkey-only owner out of their own system. There is
 * no "forgot password" to fall back on either, because Domino has no email
 * provider yet.
 *
 * So: give the account a password here, sign in with it once at the new
 * address, register a passkey there, and carry on.
 *
 * Deliberately a script and not a feature. Setting someone else's password
 * from outside the login flow is exactly the capability an attacker wants,
 * and it belongs on the machine with database credentials, not behind a
 * button. It runs as the migration role, writes the same hash format Better
 * Auth writes, and prompts for the password rather than taking it as an
 * argument, so it never lands in a shell history.
 */

/**
 * Asks for the password twice, without echoing it.
 *
 * One readline interface for both prompts: closing and reopening leaves
 * stdin in a state the next question rejects on.
 */
async function promptForPassword(label: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const target = rl as unknown as { _writeToOutput?: (text: string) => void };
  const original = target._writeToOutput?.bind(rl);
  let muted = false;
  target._writeToOutput = (text: string) => {
    if (!muted) original?.(text);
  };

  async function ask(question: string): Promise<string> {
    const answer = rl.question(question);
    muted = true;
    const value = await answer;
    muted = false;
    process.stdout.write("\n");
    return value;
  }

  try {
    const first = await ask(`Ny adgangskode for ${label}: `);
    const second = await ask("Gentag: ");
    if (first !== second) throw new Error("De to adgangskoder er ikke ens.");
    return first;
  } finally {
    rl.close();
  }
}

/** Reads the whole of a piped stdin and takes its first line. */
async function readPipedPassword(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8").split("\n")[0]!.replace(/\r$/, "");
}

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Brug: pnpm script scripts/set-password.ts <email>");
    process.exit(1);
  }

  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL is not set");

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const user = await pool.query<{ id: string; name: string; email: string }>(
      "select id, name, email from users where lower(email) = $1",
      [email],
    );
    if (user.rowCount === 0) {
      console.error(`Fandt ingen bruger med e-mail ${email}.`);
      process.exit(1);
    }
    const { id: userId, name } = user.rows[0]!;

    // Typed at a terminal it is asked for twice and never echoed. Piped in
    // it is read from stdin, which is what makes this script testable and
    // scriptable without ever putting a password in a shell history.
    const password = process.stdin.isTTY
      ? await promptForPassword(`${name} <${email}>`)
      : await readPipedPassword();
    // The same floor the sign-up flow enforces (OWASP ASVS).
    if (password.length < 12) {
      console.error("Adgangskoden skal være mindst 12 tegn.");
      process.exit(1);
    }

    const hash = await hashPassword(password);
    const existing = await pool.query<{ id: string }>(
      "select id from accounts where user_id = $1 and provider_id = 'credential'",
      [userId],
    );

    if (existing.rowCount && existing.rows[0]) {
      await pool.query("update accounts set password = $1, updated_at = now() where id = $2", [
        hash,
        existing.rows[0].id,
      ]);
      console.log("Adgangskoden er opdateret.");
    } else {
      await pool.query(
        `insert into accounts (id, issuer, account_id, provider_id, user_id, password, created_at, updated_at)
         values ($1, 'local:credential', $2, 'credential', $2, $3, now(), now())`,
        [randomBytes(16).toString("hex"), userId, hash],
      );
      console.log("Adgangskoden er oprettet.");
    }

    console.log(`Log ind med ${email} og den adgangskode, og opret en ny passkey bagefter.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
