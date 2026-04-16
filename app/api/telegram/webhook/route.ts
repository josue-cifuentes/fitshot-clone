import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { identifyFoodItems, calculateCaloriesForItems } from "@/lib/gemini-calories";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId: string | number, text: string) {
  console.log(`[Telegram] Sending reply to: ${chatId}. Message: ${text.slice(0, 50)}...`);
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    
    const body = await res.json();
    console.log(`[Telegram] sendMessage response status: ${res.status}`);
    if (!res.ok) {
      console.error(`[Telegram] Error sending message: ${JSON.stringify(body)}`);
    }
  } catch (e) {
    console.error("[Telegram] Failed to send telegram message:", e);
  }
}

async function getTelegramFile(fileId: string) {
  console.log("Step 4: Fetching file from Telegram for fileId:", fileId);
  try {
    const res = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const data = await res.json();
    if (!data.ok) throw new Error(`Telegram getFile failed: ${JSON.stringify(data)}`);
    
    const filePath = data.result.file_path;
    console.log("Step 4.1: File path retrieved:", filePath);
    
    const fileRes = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`);
    if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`);
    
    const buffer = await fileRes.arrayBuffer();
    console.log("Step 4.2: File downloaded, buffer size:", buffer.byteLength);
    
    return {
      base64: Buffer.from(buffer).toString("base64"),
      mimeType: "image/jpeg",
    };
  } catch (e) {
    console.error("CRASH in getTelegramFile:", e);
    throw e;
  }
}

function calculateTDEE(weight: number, height: number, age: number, activityLevel: string): { bmr: number; tdee: number } {
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
  let update: any;
  try {
    update = await req.json();
  } catch (e) {
    return NextResponse.json({ ok: true });
  }
  
  console.log("Telegram Update Received:", JSON.stringify(update, null, 2));

  // Process in background
  (async () => {
    try {
      const message = update.message;
      if (!message || !message.chat?.id) {
        console.log("Update has no valid message or chat ID");
        return;
      }

      const chatId = String(message.chat.id);
      const text = message.text?.trim();
      const photo = message.photo;

      console.log("Processing message from chat:", chatId);

      // Step 1: Looking up user
      console.log("Step 1: Looking up user/state for chat:", chatId);
      let state;
      try {
        state = await prisma.telegramState.findUnique({ where: { telegramChatId: chatId } });
      } catch (e) {
        console.error("CRASH during prisma lookup:", e);
        throw e;
      }

      // Step 2: User found/not found
      if (!state) {
        console.log("Step 2: User state not found, creating IDLE state");
        try {
          state = await prisma.telegramState.create({ data: { telegramChatId: chatId, state: "IDLE" } });
        } catch (e) {
          console.error("CRASH during prisma create:", e);
          throw e;
        }
      } else {
        console.log("Step 2: User state found:", state.state);
      }

      // Check if user is linked to a profile
      if (!state.userProfileId && !text?.startsWith("/start")) {
        console.log("Step 2.1: User not linked to Strava profile");
        await sendMessage(chatId, "Welcome! Please connect your account at https://fitshot-clone.vercel.app first.");
        return;
      }

      // 1. Handle Photo (Food Analysis)
      if (photo) {
        console.log("Step 3: Detected photo message");
        const bestPhoto = photo[photo.length - 1];
        try {
          const { base64, mimeType } = await getTelegramFile(bestPhoto.file_id);
          await sendMessage(chatId, "Analyzing your meal... 🧐");
          
          console.log("Step 5: Calling Gemini identifyFoodItems");
          const items = await identifyFoodItems(base64, mimeType);
          console.log("Step 5.1: Gemini responded with items:", items);

          if (items.length === 0) {
            await sendMessage(chatId, "I couldn't identify any food in that photo. Try another one!");
            return;
          }

          await prisma.telegramState.update({
            where: { telegramChatId: chatId },
            data: {
              state: "AWAITING_SIZES",
              context: JSON.stringify({ items }),
            },
          });

          await sendMessage(chatId, `I found: *${items.join(", ")}*.\n\nPlease tell me the portion size or weight for each one (e.g., "100g chicken, 1 cup rice").`);
        } catch (e: any) {
          console.error("CRASH in photo handling:", e);
          const errorMsg = e.name === "AbortError" 
            ? "Analysis took too long, please try again." 
            : `Sorry, something went wrong during analysis: ${e.message}`;
          await sendMessage(chatId, errorMsg);
        }
        return;
      }

      // 2. Handle Text Responses
      if (text) {
        console.log("Step 3: Detected text message:", text);
        if (text.startsWith("/start")) {
          const stravaId = text.split(" ")[1];
          if (stravaId) {
            console.log("Step 3.1: Linking Strava ID:", stravaId);
            const profile = await prisma.userProfile.findUnique({ where: { id: stravaId } });
            if (profile) {
              await prisma.telegramState.update({
                where: { telegramChatId: chatId },
                data: { userProfileId: profile.id },
              });
              await sendMessage(chatId, `Connected! ✅ Welcome ${profile.stravaDisplayName}. Send me a photo of your meal to start tracking.`);
              return;
            } else {
              console.log("Step 3.2: Profile not found for ID:", stravaId);
            }
          }
          await sendMessage(chatId, "Welcome to FitShot! Send me a food photo to track your calories.");
          return;
        }

        // State Machine
        switch (state.state) {
          case "AWAITING_SIZES": {
            try {
              const context = JSON.parse(state.context || "{}");
              const itemsWithSizes = context.items.map((item: string) => ({ item, size: text }));

              await sendMessage(chatId, "Calculating calories... 🔢");
              console.log("Step 5: Calling Gemini calculateCaloriesForItems");
              const results = await calculateCaloriesForItems(itemsWithSizes);
              console.log("Step 5.1: Gemini responded with results:", results);
              
              const total = results.reduce((sum, r) => sum + r.calories, 0);

              // Send reply immediately
              const summary = results.map(r => `• ${r.item}: ${r.calories} kcal`).join("\n");
              await sendMessage(chatId, `Meal logged! ✅\n\n${summary}\n\n*Total for this meal: ${total} kcal.*`);

              // Write to DB in background
              if (state.userProfileId) {
                prisma.calorieEntry.create({
                  data: {
                    userProfileId: state.userProfileId,
                    type: "meal",
                    calories: total,
                    description: results.map(r => r.item).join(", "),
                    itemsJson: JSON.stringify(results),
                  }
                }).catch(err => console.error("CRASH during DB Write:", err));
              }

              await prisma.telegramState.update({
                where: { telegramChatId: chatId },
                data: { state: "IDLE", context: null },
              });
            } catch (e: any) {
              console.error("CRASH in calorie calculation:", e);
              const errorMsg = e.name === "AbortError" 
                ? "Calculation took too long, please try again." 
                : `Sorry, I couldn't calculate the calories: ${e.message}`;
              await sendMessage(chatId, errorMsg);
            }
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

          default: {
            if (text.toLowerCase().includes("checkin") || text.toLowerCase().includes("setup")) {
              await prisma.telegramState.update({
                where: { telegramChatId: chatId },
                data: { state: "AWAITING_DEFICIT_GOAL" },
              });
              await sendMessage(chatId, "Let's set up your goals! What is your daily calorie deficit goal for this week? (e.g., 500)");
            } else {
              await sendMessage(chatId, "Welcome to FitShot! Send me a food photo to track your calories, or say 'setup' to update your goals.");
            }
          }
        }
        return;
      }
    } catch (e) {
      console.error("CRITICAL: Message handling error:", e);
    }
  })();

  return NextResponse.json({ ok: true });
}
