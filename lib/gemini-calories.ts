import { GoogleGenerativeAI } from "@google/generative-ai";

/** Vision / photo analysis */
const GEMINI_FLASH = "gemini-2.5-flash";
/** Text-only conversation */
const GEMINI_FLASH_LITE = "gemini-2.5-flash-lite";

function requireGeminiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY is not set");
  return k;
}

export async function identifyFoodItems(imageBase64: string, mimeType: string): Promise<string[]> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey());
  const model = genAI.getGenerativeModel({ model: GEMINI_FLASH });

  const prompt = "Identify all individual food items in this image. Return ONLY a JSON array of strings, e.g. [\"grilled chicken breast\", \"steamed broccoli\", \"brown rice\"]. If no food is found, return [].";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: imageBase64,
          mimeType,
        },
      },
    ], { signal: controller.signal });

    const text = result.response.text();
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/** One-shot meal photo analysis for Telegram — plain text + optional total kcal for logging. */
export async function analyzeFoodPhotoForTelegram(
  imageBase64: string,
  mimeType: string
): Promise<{ text: string; estimatedTotalKcal: number | null }> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey());
  const model = genAI.getGenerativeModel({ model: GEMINI_FLASH });

  const prompt = `You are a nutrition assistant. Look at this food photo.
Describe what you see briefly (2–4 short sentences).
Give a rough estimated total calories for the whole plate as one number (integer).
Respond with ONLY valid JSON, no markdown:
{"text":"your friendly plain-text message for the user (no markdown)","estimatedTotalKcal":number or null if unsure}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const result = await model.generateContent(
      [
        prompt,
        {
          inlineData: {
            data: imageBase64,
            mimeType,
          },
        },
      ],
      { signal: controller.signal }
    );

    const raw = result.response.text().trim();
    const match = raw.match(/\{[\s\S]*\}/);
    const json = match ? JSON.parse(match[0]) : null;
    if (!json || typeof json.text !== "string") {
      return { text: raw.slice(0, 800) || "I couldn't read that image clearly.", estimatedTotalKcal: null };
    }
    const kcal =
      typeof json.estimatedTotalKcal === "number" && Number.isFinite(json.estimatedTotalKcal)
        ? Math.round(json.estimatedTotalKcal)
        : null;
    return { text: json.text.slice(0, 3500), estimatedTotalKcal: kcal };
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Short Telegram reply for plain text (no images). */
export async function generateTelegramTextReply(userMessage: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey());
  const model = genAI.getGenerativeModel({
    model: GEMINI_FLASH_LITE,
    generationConfig: { maxOutputTokens: 400, temperature: 0.4 },
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const prompt = `You are FitShot's friendly nutrition assistant on Telegram.
The user cannot send images in this turn — they sent text only.
Reply in 2–4 short sentences, plain text only (no markdown).
Encourage sending a food photo for calorie estimates. Answer briefly if they asked something simple about calories, portions, or healthy eating.
If they only said hi or thanks, be warm and remind them they can send a meal photo.

User message:
"""${userMessage.replace(/"""/g, "'").slice(0, 2000)}"""`;

    const result = await model.generateContent(prompt, { signal: controller.signal });
    const out = result.response.text().trim();
    return out.slice(0, 3500) || "Send me a food photo anytime and I'll estimate the calories 🍽️";
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function calculateCaloriesForItems(itemsWithSizes: { item: string; size: string }[]): Promise<{ item: string; calories: number }[]> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey());
  const model = genAI.getGenerativeModel({ model: GEMINI_FLASH_LITE });

  const prompt = `Calculate the estimated calories for each food item based on the provided portion sizes. 
  Items: ${JSON.stringify(itemsWithSizes)}
  
  Return ONLY a JSON array of objects with "item" and "calories" (integer) properties.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const result = await model.generateContent(prompt, { signal: controller.signal });
    const text = result.response.text();
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } finally {
    clearTimeout(timeoutId);
  }
}
