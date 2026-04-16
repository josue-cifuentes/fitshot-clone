import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { identifyFoodItems, calculateCaloriesForItems } from "@/lib/gemini-calories";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId: string | number, text: string) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

async function getTelegramFile(fileId: string) {
  const res = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const { result } = await res.json();
  const fileRes = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${result.file_path}`);
  const buffer = await fileRes.arrayBuffer();
  return {
    base64: Buffer.from(buffer).toString("base64"),
    mimeType: "image/jpeg",
  };
}

function calculateTDEE(weight: number, height: number, age: number, activityLevel: string): { bmr: number; tdee: number } {
  // Mifflin-St Jeor Formula (assuming male for general estimate, can be refined)
  const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  
  const multipliers: Record<string, number> = {
    sedentary: 1.2,
    lightly_active: 1.375,
    moderately_active: 1.55,
    very_active: 1.725,
  };

  const tdee = bmr * (multipliers[activityLevel] || 1.2);
  return { bmr, tdee };
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const message = update.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = String(message.chat.id);
    const text = message.text?.trim();
    const photo = message.photo;

    // Find or create state
    let state = await prisma.telegramState.findUnique({ where: { telegramChatId: chatId } });
    if (!state) {
      state = await prisma.telegramState.create({ data: { telegramChatId: chatId, state: "IDLE" } });
    }

    // 1. Handle Photo (Food Analysis)
    if (photo) {
      const bestPhoto = photo[photo.length - 1];
      const { base64, mimeType } = await getTelegramFile(bestPhoto.file_id);
      
      await sendMessage(chatId, "Analyzing your meal... 🧐");
      const items = await identifyFoodItems(base64, mimeType);

      if (items.length === 0) {
        await sendMessage(chatId, "I couldn't identify any food in that photo. Try another one!");
        return NextResponse.json({ ok: true });
      }

      await prisma.telegramState.update({
        where: { telegramChatId: chatId },
        data: {
          state: "AWAITING_SIZES",
          context: JSON.stringify({ items }),
        },
      });

      await sendMessage(chatId, `I found: *${items.join(", ")}*.\n\nPlease tell me the portion size or weight for each one (e.g., "100g chicken, 1 cup rice").`);
      return NextResponse.json({ ok: true });
    }

    // 2. Handle Text Responses (State Machine)
    if (text) {
      // Handle Start
      if (text.startsWith("/start")) {
        const stravaId = text.split(" ")[1];
        if (stravaId) {
          const profile = await prisma.userProfile.findUnique({ where: { id: stravaId } });
          if (profile) {
            await prisma.telegramState.update({
              where: { telegramChatId: chatId },
              data: { userProfileId: profile.id },
            });
            await sendMessage(chatId, `Connected! ✅ Welcome ${profile.stravaDisplayName}. Send me a photo of your meal to start tracking.`);
            return NextResponse.json({ ok: true });
          }
        }
        await sendMessage(chatId, "Welcome! Please connect your Strava account from the FitShot dashboard to link your profile.");
        return NextResponse.json({ ok: true });
      }

      // State Machine
      switch (state.state) {
        case "AWAITING_SIZES": {
          const context = JSON.parse(state.context || "{}");
          const itemsWithSizes = context.items.map((item: string) => ({ item, size: text }));

          await sendMessage(chatId, "Calculating calories... 🔢");
          const results = await calculateCaloriesForItems(itemsWithSizes);
          const total = results.reduce((sum, r) => sum + r.calories, 0);

          if (state.userProfileId) {
            await prisma.calorieEntry.create({
              data: {
                userProfileId: state.userProfileId,
                type: "meal",
                calories: total,
                description: results.map(r => r.item).join(", "),
                itemsJson: JSON.stringify(results),
              }
            });
          }

          const summary = results.map(r => `• ${r.item}: ${r.calories} kcal`).join("\n");
          await sendMessage(chatId, `Meal logged! ✅\n\n${summary}\n\n*Total for this meal: ${total} kcal.*`);
          
          await prisma.telegramState.update({
            where: { telegramChatId: chatId },
            data: { state: "IDLE", context: null },
          });
          break;
        }

        case "AWAITING_DEFICIT_GOAL": {
          const goal = parseInt(text);
          await prisma.telegramState.update({
            where: { telegramChatId: chatId },
            data: { state: "AWAITING_WEIGHT", context: JSON.stringify({ deficit: goal }) },
          });
          await sendMessage(chatId, "Got it. What is your current weight in kg?");
          break;
        }

        case "AWAITING_WEIGHT": {
          const weight = parseFloat(text);
          const context = JSON.parse(state.context || "{}");
          await prisma.telegramState.update({
            where: { telegramChatId: chatId },
            data: { state: "AWAITING_HEIGHT", context: JSON.stringify({ ...context, weight }) },
          });
          await sendMessage(chatId, "What is your height in cm?");
          break;
        }

        case "AWAITING_HEIGHT": {
          const height = parseFloat(text);
          const context = JSON.parse(state.context || "{}");
          await prisma.telegramState.update({
            where: { telegramChatId: chatId },
            data: { state: "AWAITING_AGE", context: JSON.stringify({ ...context, height }) },
          });
          await sendMessage(chatId, "What is your age?");
          break;
        }

        case "AWAITING_AGE": {
          const age = parseInt(text);
          const context = JSON.parse(state.context || "{}");
          await prisma.telegramState.update({
            where: { telegramChatId: chatId },
            data: { state: "AWAITING_ACTIVITY", context: JSON.stringify({ ...context, age }) },
          });
          await sendMessage(chatId, "What is your activity level?\n\nOptions: sedentary, lightly_active, moderately_active, very_active");
          break;
        }

        case "AWAITING_ACTIVITY": {
          const activity = text.toLowerCase();
          const context = JSON.parse(state.context || "{}");
          const { bmr, tdee } = calculateTDEE(context.weight, context.height, context.age, activity);
          const target = Math.round(tdee - context.deficit);

          if (state.userProfileId) {
            await prisma.userProfile.update({
              where: { id: state.userProfileId },
              data: {
                weightKg: context.weight,
                heightCm: context.height,
                age: context.age,
                activityLevel: activity,
                dailyDeficitGoal: context.deficit,
                bmr,
                tdee,
                targetCalories: target,
              }
            });
          }

          let msg = `✅ *Goals Set!*\n\n`;
          msg += `BMR: ${Math.round(bmr)} kcal\n`;
          msg += `TDEE: ${Math.round(tdee)} kcal\n`;
          msg += `Daily Target: *${target} kcal* to hit your ${context.deficit} kcal deficit.`;
          
          await sendMessage(chatId, msg);
          await prisma.telegramState.update({
            where: { telegramChatId: chatId },
            data: { state: "IDLE", context: null },
          });
          break;
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ ok: true });
  }
}
