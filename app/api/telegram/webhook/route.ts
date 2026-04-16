import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  calculateCaloriesForItems,
  identifyFoodItems,
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

async function downloadTelegramPhoto(
  fileId: string,
  token: string
): Promise<{ base64: string; mimeType: string }> {
  const meta = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const metaJson = (await meta.json()) as {
    ok?: boolean;
    result?: { file_path?: string };
  };
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

function foodItemsFromJson(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((x): x is string => typeof x === "string");
}

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ ok: true });
  }

  let body: {
    message?: { chat?: { id: number }; text?: string; photo?: { file_id: string }[] };
  };
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

  const chatIdStr = String(chatId);
  const text = message.text?.trim();
  const photos = message.photo;

  try {
    if (photos && photos.length > 0) {
      await telegramReply(chatId, "📸 Analyzing your food...", token);

      const best = photos[photos.length - 1];
      const { base64, mimeType } = await downloadTelegramPhoto(best.file_id, token);
      const items = await identifyFoodItems(base64, mimeType);

      if (items.length === 0) {
        await prisma.telegramSession.upsert({
          where: { chatId: chatIdStr },
          create: { chatId: chatIdStr, state: "idle", foodItems: Prisma.JsonNull },
          update: { state: "idle", foodItems: Prisma.JsonNull },
        });
        await telegramReply(
          chatId,
          "I couldn't spot food in that image. Send another photo 📸",
          token
        );
      } else {
        await prisma.telegramSession.upsert({
          where: { chatId: chatIdStr },
          create: {
            chatId: chatIdStr,
            state: "waiting_for_portions",
            foodItems: items,
          },
          update: {
            state: "waiting_for_portions",
            foodItems: items,
          },
        });
        await telegramReply(
          chatId,
          `I see: ${items.join(", ")}.\n\nHow much of each item did you eat? (e.g. 1 cup rice, 2 eggs)`,
          token
        );
      }
    } else if (text) {
      const session = await prisma.telegramSession.findUnique({
        where: { chatId: chatIdStr },
      });

      if (session?.state === "waiting_for_portions") {
        const items = foodItemsFromJson(session.foodItems);
        if (items.length === 0) {
          await prisma.telegramSession.update({
            where: { chatId: chatIdStr },
            data: { state: "idle", foodItems: Prisma.JsonNull },
          });
          await telegramReply(
            chatId,
            "Something went wrong with the food list. Send a new photo 📸",
            token
          );
        } else {
          const itemsWithSizes = items.map((item) => ({ item, size: text }));
          const results = await calculateCaloriesForItems(itemsWithSizes);
          const total = results.reduce((sum, r) => sum + r.calories, 0);
          const summary = results
            .map((r) => `• ${r.item}: ${r.calories} kcal`)
            .join("\n");

          await prisma.telegramSession.update({
            where: { chatId: chatIdStr },
            data: { state: "idle", foodItems: Prisma.JsonNull },
          });

          await telegramReply(
            chatId,
            `Here's your meal:\n${summary}\n\nTotal: ${total} kcal`,
            token
          );

          void (async () => {
            try {
              const profile = await prisma.userProfile.findFirst({
                where: { telegramChatId: chatIdStr },
              });
              if (profile && total > 0) {
                await prisma.calorieEntry.create({
                  data: {
                    userProfileId: profile.id,
                    type: "meal",
                    calories: total,
                    description: results.map((r) => r.item).join(", "),
                    itemsJson: JSON.stringify(results),
                  },
                });
              }
            } catch (e) {
              console.error("[telegram] persist calories (non-blocking):", e);
            }
          })();
        }
      } else {
        await telegramReply(
          chatId,
          "Send me a food photo to log your calories 📸",
          token
        );
      }
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
