import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  analyzeFoodPhotoForTelegram,
  generateTelegramTextReply,
} from "@/lib/gemini-calories";

const TELEGRAM_SEND = (token: string) =>
  `https://api.telegram.org/bot${token}/sendMessage`;

async function telegramReply(chatId: number | string, text: string, token: string) {
  const res = await fetch(TELEGRAM_SEND(token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("[telegram] sendMessage failed", res.status, body.slice(0, 500));
  }
}

async function downloadTelegramPhoto(fileId: string, token: string): Promise<{ base64: string; mimeType: string }> {
  const meta = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const metaJson = (await meta.json()) as { ok?: boolean; result?: { file_path?: string } };
  if (!metaJson.ok || !metaJson.result?.file_path) {
    throw new Error("getFile failed");
  }
  const path = metaJson.result.file_path;
  const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
  if (!fileRes.ok) {
    throw new Error(`file download ${fileRes.status}`);
  }
  const buf = Buffer.from(await fileRes.arrayBuffer());
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : "image/jpeg";
  return { base64: buf.toString("base64"), mimeType };
}

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ ok: true });
  }

  let body: { message?: { chat?: { id: number }; text?: string; photo?: { file_id: string }[] } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const { message } = body;
  if (!message) {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat?.id;
  if (chatId == null) {
    return NextResponse.json({ ok: true });
  }

  const text = message.text?.trim();
  const photos = message.photo;

  try {
    if (text) {
      let reply: string;
      try {
        reply = await generateTelegramTextReply(text);
      } catch {
        reply =
          "Hi! Send me a food photo and I'll calculate the calories 🍽️";
      }
      await telegramReply(chatId, reply, token);
    } else if (photos && photos.length > 0) {
      await telegramReply(chatId, "📸 Analyzing your food...", token);

      const best = photos[photos.length - 1];
      const { base64, mimeType } = await downloadTelegramPhoto(best.file_id, token);
      const { text: analysis, estimatedTotalKcal } = await analyzeFoodPhotoForTelegram(
        base64,
        mimeType
      );
      await telegramReply(chatId, analysis, token);

      void (async () => {
        try {
          const profile = await prisma.userProfile.findFirst({
            where: { telegramChatId: String(chatId) },
          });
          if (profile && estimatedTotalKcal != null && estimatedTotalKcal > 0) {
            await prisma.calorieEntry.create({
              data: {
                userProfileId: profile.id,
                type: "meal",
                calories: estimatedTotalKcal,
                description: analysis.slice(0, 500),
              },
            });
          }
        } catch (e) {
          console.error("[telegram] persist calories (non-blocking):", e);
        }
      })();
    }
  } catch (e) {
    console.error("[telegram] handler error:", e);
    try {
      await telegramReply(
        chatId,
        "Something went wrong. Please try again in a moment.",
        token
      );
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ ok: true });
}
