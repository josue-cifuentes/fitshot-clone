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

      // BYPASS USER LOOKUP FOR NOW - Ensure bot always replies
      let state = null;
      try {
        console.log("Step 1: Looking up user/state for chat:", chatId);
        state = await prisma.telegramState.findUnique({ where: { telegramChatId: chatId } });
        
        if (!state) {
          console.log("Step 2: User state not found, creating IDLE state");
          state = await prisma.telegramState.create({ data: { telegramChatId: chatId, state: "IDLE" } });
        } else {
          console.log("Step 2: User state found:", state.state);
        }
      } catch (e) {
        console.error("CRASH during prisma operations (non-fatal):", e);
        // Continue without state if DB fails
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

          if (state) {
            await prisma.telegramState.update({
              where: { telegramChatId: chatId },
              data: {
                state: "AWAITING_SIZES",
                context: JSON.stringify({ items }),
              },
            });
          }

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
        
        // Handle Start / Linking
        if (text.startsWith("/start")) {
          const stravaId = text.split(" ")[1];
          if (stravaId) {
            console.log("Step 3.1: Linking Strava ID:", stravaId);
            try {
              const profile = await prisma.userProfile.findUnique({ where: { id: stravaId } });
              if (profile) {
                await prisma.telegramState.update({
                  where: { telegramChatId: chatId },
                  data: { userProfileId: profile.id },
                });
                // Also link the profile itself for reverse lookup
                await prisma.userProfile.update({
                  where: { id: profile.id },
                  data: { telegramChatId: chatId },
                });
                await sendMessage(chatId, `Connected! ✅ Welcome ${profile.stravaDisplayName}. Send me a photo of your meal to start tracking.`);
                return;
              }
            } catch (e) {
              console.error("CRASH during linking:", e);
            }
          }
          await sendMessage(chatId, "Hi! Send me a food photo and I'll analyze the calories for you 🍽️");
          return;
        }

        // State Machine (only if state exists)
        if (state) {
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
                return;
              } catch (e: any) {
                console.error("CRASH in calorie calculation:", e);
                const errorMsg = e.name === "AbortError" 
                  ? "Calculation took too long, please try again." 
                  : `Sorry, I couldn't calculate the calories: ${e.message}`;
                await sendMessage(chatId, errorMsg);
                return;
              }
            }
            // ... other states ...
          }
        }

        // Default reply for any text message
        await sendMessage(chatId, "Hi! Send me a food photo and I'll analyze the calories for you 🍽️");
      }
    } catch (e) {
      console.error("CRITICAL: Message handling error:", e);
    }
  })();

  return NextResponse.json({ ok: true });
}
