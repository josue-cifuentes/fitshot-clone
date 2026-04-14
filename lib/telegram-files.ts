function requireBotToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

type GetFileResult = {
  ok: boolean;
  result?: { file_path: string; file_size?: number };
};

/**
 * Download a file from Telegram (e.g. largest photo `file_id`).
 * @see https://core.telegram.org/bots/api#getfile
 */
export async function downloadTelegramFileAsBase64(fileId: string): Promise<{
  base64: string;
  mimeType: string;
}> {
  const token = requireBotToken();
  const metaRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    { cache: "no-store" }
  );
  const meta = (await metaRes.json()) as GetFileResult;
  if (!meta.ok || !meta.result?.file_path) {
    throw new Error("Telegram getFile failed");
  }
  const filePath = meta.result.file_path;
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const bin = await fetch(url, { cache: "no-store" });
  if (!bin.ok) {
    throw new Error(`Telegram file download failed (${bin.status})`);
  }
  const buf = Buffer.from(await bin.arrayBuffer());
  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeType =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "gif"
          ? "image/gif"
          : "image/jpeg";
  return { base64: buf.toString("base64"), mimeType };
}
