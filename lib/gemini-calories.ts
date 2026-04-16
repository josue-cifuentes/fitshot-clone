import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_MODEL = "gemini-2.0-flash";

function requireGeminiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY is not set");
  return k;
}

export async function identifyFoodItems(imageBase64: string, mimeType: string): Promise<string[]> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey());
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

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

export async function calculateCaloriesForItems(itemsWithSizes: { item: string; size: string }[]): Promise<{ item: string; calories: number }[]> {
  const genAI = new GoogleGenerativeAI(requireGeminiKey());
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

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
