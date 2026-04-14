import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI does not load `.env` before evaluating this file, so read common env files here.
 * `.env.local` overrides `.env` (same idea as Next.js).
 */
function loadEnvFiles() {
  const root = process.cwd();
  const paths = [join(root, ".env"), join(root, ".env.local")];
  for (const filePath of paths) {
    if (!existsSync(filePath)) continue;
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnvFiles();

/**
 * Connection URL is read from `process.env` (after `loadEnvFiles()` above).
 * - Vercel injects `DATABASE_URL` at build and runtime (Neon).
 *
 * When `DATABASE_URL` is unset (e.g. fresh `npm install` before env is configured), we use a Postgres-shaped
 * placeholder so `prisma generate` can run. Migrations and the app still require a real Neon URL.
 */
function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  const url = typeof raw === "string" ? raw.trim() : "";
  if (url) return url;
  return "postgresql://127.0.0.1:5432/_unset_database_url?schema=public";
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl(),
  },
});
