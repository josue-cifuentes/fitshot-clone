import { NextResponse } from "next/server";

/** Use for unexpected failures in API route catch blocks (always valid JSON). */
export function internalServerErrorJson() {
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}

/**
 * Logs full message and stack (Vercel / server console). Use before returning 500.
 * `route` should identify method + path, e.g. `GET /api/coach/dashboard`.
 */
export function logInternalServerError(route: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[api ${route}] Internal server error: ${message}`);
  if (stack) {
    console.error(stack);
  }
}

/** Log details then return generic 500 JSON (for route catch blocks). */
export function internalServerErrorJsonLogged(route: string, err: unknown) {
  logInternalServerError(route, err);
  return internalServerErrorJson();
}
