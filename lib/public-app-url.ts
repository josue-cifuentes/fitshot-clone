/** Public site URL for webhooks and OAuth (no trailing slash). */
export function getPublicAppUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!base) return "";
  return base.replace(/\/$/, "");
}
