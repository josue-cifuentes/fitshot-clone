import { NextRequest, NextResponse } from "next/server";
import { internalServerErrorJson } from "@/lib/api-internal-error";
import { getPublicAppUrl } from "@/lib/public-app-url";

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * One-time (or after deploy) call to register Telegram webhook with Telegram servers.
 * POST with Authorization: Bearer CRON_SECRET
 *
 * Optional: set TELEGRAM_WEBHOOK_SECRET — Telegram will send it as X-Telegram-Bot-Api-Secret-Token.
 */
export async function POST(req: NextRequest) {
  try {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN not set" },
      { status: 503 }
    );
  }

  const base = getPublicAppUrl();
  if (!base) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL not set" },
      { status: 503 }
    );
  }

  const url = `${base}/api/telegram/webhook`;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  const params = new URLSearchParams({ url });
  if (secret) params.set("secret_token", secret);

  const tg = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook?${params.toString()}`,
    { method: "POST", cache: "no-store" }
  );
  const body = (await tg.json()) as { ok?: boolean; description?: string };

  if (!tg.ok || !body.ok) {
    return NextResponse.json(
      { error: body.description ?? "setWebhook failed", status: tg.status },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, webhookUrl: url });
  } catch {
    return internalServerErrorJson();
  }
}
