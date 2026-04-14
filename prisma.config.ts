import { defineConfig } from "prisma/config";

/**
 * Connection URL is read from `process.env` only (no dotenv).
 * - Vercel injects `DATABASE_URL` at build and runtime (Neon).
 * - Locally, set `DATABASE_URL` in `.env.local` (Next.js loads it for the app) or export it for Prisma CLI.
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
