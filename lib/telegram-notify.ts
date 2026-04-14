function requireBotToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

const TELEGRAM_MAX = 4096;

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    out.push(text.slice(i, i + maxLen));
  }
  return out;
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const token = requireBotToken();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const parts = chunkText(text, TELEGRAM_MAX);
  for (const part of parts) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: part,
        disable_web_page_preview: true,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Telegram API ${res.status}: ${err.slice(0, 400)}`);
    }
  }
}
