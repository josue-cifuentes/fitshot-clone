import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  calculateCaloriesForItems,
  extractUserDemographicsFromMessage,
  identifyFoodItems,
  nutritionAssistantReply,
} from "@/lib/gemini-calories";
import { logMealToSheet, sheetDateDayFromUtc } from "@/lib/googleSheets";
import { mealLogMetricsForTelegramChat } from "@/lib/meal-metrics";

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

function parseUserData(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

function fmtCal(n: number): string {
  return `${n.toLocaleString("en-US")} cal`;
}

function parseMealTypeReply(raw: string): "breakfast" | "lunch" | "dinner" | "snack" | null {
  const t = raw.trim().toLowerCase().replace(/\.$/, "");
  const allowed = ["breakfast", "lunch", "dinner", "snack"] as const;
  if ((allowed as readonly string[]).includes(t)) {
    return t as (typeof allowed)[number];
  }
  if (t.startsWith("break")) return "breakfast";
  if (t.startsWith("lunch")) return "lunch";
  if (t.startsWith("dinn")) return "dinner";
  if (t.startsWith("snack")) return "snack";
  return null;
}

function labelMealType(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
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
          create: {
            chatId: chatIdStr,
            state: "idle",
            foodItems: Prisma.JsonNull,
            mealType: null,
            waitingFor: null,
          },
          update: {
            state: "idle",
            foodItems: Prisma.JsonNull,
            mealType: null,
            waitingFor: null,
          },
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
            state: "meal_logging",
            foodItems: items,
            mealType: null,
            waitingFor: "meal_type",
          },
          update: {
            state: "meal_logging",
            foodItems: items,
            mealType: null,
            waitingFor: "meal_type",
          },
        });
        await telegramReply(
          chatId,
          `I see: ${items.join(", ")}.\n\nWhat meal is this? Reply with: Breakfast, Lunch, Dinner, or Snack`,
          token
        );
      }
    } else if (text) {
      let session = await prisma.telegramSession.findUnique({
        where: { chatId: chatIdStr },
      });
      if (!session) {
        session = await prisma.telegramSession.create({
          data: { chatId: chatIdStr, state: "idle" },
        });
      }

      if (session.waitingFor === "portions") {
        const items = foodItemsFromJson(session.foodItems);
        if (items.length === 0 || !session.mealType) {
          await prisma.telegramSession.update({
            where: { chatId: chatIdStr },
            data: {
              state: "idle",
              foodItems: Prisma.JsonNull,
              mealType: null,
              waitingFor: null,
            },
          });
          await telegramReply(
            chatId,
            "Something went wrong with the meal flow. Send a new photo 📸",
            token
          );
        } else {
          const itemsWithSizes = items.map((item) => ({ item, size: text }));
          const results = await calculateCaloriesForItems(itemsWithSizes);
          const total = results.reduce((sum, r) => sum + r.calories, 0);
          const summary = results
            .map((r) => `• ${r.item}: ${r.calories} kcal`)
            .join("\n");

          const foodsLabel = results.map((r) => `${r.item}`).join("; ");
          const loggedAt = new Date();
          const { date: sheetDate, day: sheetDay } = sheetDateDayFromUtc(loggedAt);

          let dailyDisplay = 0;
          let weeklyDisplay = 0;
          let sheetsSynced = false;
          let persisted = false;

          try {
            if (total > 0) {
              const profile = await prisma.userProfile.findFirst({
                where: { telegramChatId: chatIdStr },
              });

              await prisma.calorieEntry.create({
                data: {
                  userProfileId: profile?.id ?? null,
                  telegramChatId: chatIdStr,
                  type: session.mealType,
                  calories: total,
                  description: foodsLabel,
                  itemsJson: JSON.stringify(results),
                },
              });

              const metrics = await mealLogMetricsForTelegramChat(
                prisma,
                chatIdStr,
                loggedAt
              );
              dailyDisplay = metrics.dailyTotal;
              weeklyDisplay = metrics.weeklyTotal;
              persisted = true;

              const sheetPayload = {
                date: sheetDate,
                day: sheetDay,
                mealNumber: metrics.mealNumber,
                foods: foodsLabel,
                calories: total,
              };
              console.log("Logging to sheets:", sheetPayload);
              try {
                const sheet = await logMealToSheet(sheetPayload);
                if (sheet.sheetSynced) {
                  dailyDisplay = sheet.dailyTotal;
                  weeklyDisplay = sheet.weeklyTotal;
                  sheetsSynced = true;
                }
              } catch (error) {
                console.error("Sheets error:", error);
              }
            }
          } catch (e) {
            console.error("[telegram] persist meal:", e);
          }

          await prisma.telegramSession.update({
            where: { chatId: chatIdStr },
            data: {
              state: "idle",
              foodItems: Prisma.JsonNull,
              mealType: null,
              waitingFor: null,
            },
          });

          const intro = `Here's your ${labelMealType(session.mealType)}:\n${summary}\n\nTotal: ${total} kcal`;
          const tail = persisted
            ? `✅ Logged! ${fmtCal(total)} added. Daily total: ${fmtCal(dailyDisplay)} | Weekly total: ${fmtCal(weeklyDisplay)}.${sheetsSynced ? " Synced to Google Sheets 📊" : ""}`
            : total <= 0
              ? "Nothing to log (0 kcal)."
              : "Could not save this meal. Please try again.";
          await telegramReply(chatId, `${intro}\n\n${tail}`, token);
        }
      } else if (session.waitingFor === "meal_type") {
        const parsed = parseMealTypeReply(text);
        if (!parsed) {
          await telegramReply(
            chatId,
            "Please reply with one of: Breakfast, Lunch, Dinner, or Snack.",
            token
          );
        } else {
          const items = foodItemsFromJson(session.foodItems);
          if (items.length === 0) {
            await prisma.telegramSession.update({
              where: { chatId: chatIdStr },
              data: {
                state: "idle",
                foodItems: Prisma.JsonNull,
                mealType: null,
                waitingFor: null,
              },
            });
            await telegramReply(
              chatId,
              "Food list was lost. Send a new photo 📸",
              token
            );
          } else {
            await prisma.telegramSession.update({
              where: { chatId: chatIdStr },
              data: {
                mealType: parsed,
                waitingFor: "portions",
              },
            });
            await telegramReply(
              chatId,
              `Got it — ${labelMealType(parsed)}.\n\nHow much of each item did you eat? (e.g. 1 cup rice, 2 eggs)`,
              token
            );
          }
        }
      } else if (session.state === "idle") {
        const userData = parseUserData(session.userData);
        const reply = await nutritionAssistantReply(text, userData);
        await telegramReply(chatId, reply, token);

        void (async () => {
          try {
            const delta = await extractUserDemographicsFromMessage(text);
            if (Object.keys(delta).length > 0) {
              const merged = { ...userData, ...delta };
              await prisma.telegramSession.update({
                where: { chatId: chatIdStr },
                data: { userData: merged as Prisma.InputJsonValue },
              });
            }
          } catch (e) {
            console.error("[telegram] userData merge (non-blocking):", e);
          }
        })();
      } else {
        await prisma.telegramSession.update({
          where: { chatId: chatIdStr },
          data: {
            state: "idle",
            waitingFor: null,
            mealType: null,
            foodItems: Prisma.JsonNull,
          },
        });
        await telegramReply(
          chatId,
          "Send a food photo to log a meal 📸",
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
