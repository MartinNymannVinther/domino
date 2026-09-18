import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.MIGRATION_DATABASE_URL) {
  throw new Error("MIGRATION_DATABASE_URL is not set");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/core/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
