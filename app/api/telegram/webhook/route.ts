import { NextRequest, NextResponse } from "next/server";
import {
  fetchCoachRecoveryContext,
  getStravaAccessFromStoredRefresh,
} from "@/lib/coach-pipeline";
import {
  generateTelegramCoachChatReply,
  generateTelegramCoachPhotoReply,
} from "@/lib/gemini-coach";
import { prisma } from "@/lib/db";
import {
  appendTelegramCoachExchange,
  getTelegramCoachMemory,
} from "@/lib/telegram-coach-memory";
import { downloadTelegramFileAsBase64 } from "@/lib/telegram-files";
import { sendTelegramMessage } from "@/lib/telegram-notify";
import { fetchStravaAthlete } from "@/lib/strava";

export const dynamic = "force-dynamic";

type TelegramPhotoSize = {
  file_id: string;
  width: number;
  height: number;
  file_size?: number;
};

type TelegramMessage = {
  message_id: number;
  chat: { id: number; type?: string };
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

function verifyWebhookSecret(request: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) return true;
  const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  return got === expected;
}

const PHOTO_DEFAULT_PROMPT =
  "What do you see? Give me fitness/training advice based on this.";

export async function POST(request: NextRequest) {
  if (!verifyWebhookSecret(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const msg = update.message;
  if (!msg?.chat?.id) {
    return NextResponse.json({ ok: true });
  }

  const chatId = String(msg.chat.id);
  const text = msg.text?.trim() ?? "";
  const photos = msg.photo;
  const hasPhoto = Boolean(photos && photos.length > 0);

  try {
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      const payload = parts[1];
      if (payload) {
        const linkProfile = await prisma.coachProfile.findFirst({
          where: { telegramLinkToken: payload },
        });
        if (!linkProfile) {
          await sendTelegramMessage(
            chatId,
            "Invalid or expired link. Open FitShot → Coach → Connect Telegram and generate a new link."
          );
          return NextResponse.json({ ok: true });
        }

        await prisma.coachProfile.updateMany({
          where: {
            telegramChatId: chatId,
            NOT: { id: linkProfile.id },
          },
          data: { telegramChatId: null },
        });

        await prisma.coachProfile.update({
          where: { id: linkProfile.id },
          data: {
            telegramChatId: chatId,
            telegramLinkToken: null,
          },
        });

        await sendTelegramMessage(
          chatId,
          "You're connected to FitShot Coach. Ask me anything about training or recovery — I use your Strava and Garmin or Apple Health data.\n\nYou'll get your daily training recommendation here each morning (Guatemala time)."
        );
        return NextResponse.json({ ok: true });
      }

      await sendTelegramMessage(
        chatId,
        "Open the FitShot web app → Coach → Connect Telegram and tap the link there to link this chat."
      );
      return NextResponse.json({ ok: true });
    }

    const profile = await prisma.coachProfile.findFirst({
      where: { telegramChatId: chatId },
    });

    if (!profile) {
      await sendTelegramMessage(
        chatId,
        "This chat isn't linked to FitShot. Open fitshot.app (or your site) → Coach → Connect Telegram."
      );
      return NextResponse.json({ ok: true });
    }

    if (!process.env.GEMINI_API_KEY) {
      await sendTelegramMessage(
        chatId,
        "Coach AI isn't configured on the server yet."
      );
      return NextResponse.json({ ok: true });
    }

    const access = await getStravaAccessFromStoredRefresh(profile);
    if (!access) {
      await sendTelegramMessage(
        chatId,
        "Connect Strava once in the FitShot app (Connect tab) so I can load your activities."
      );
      return NextResponse.json({ ok: true });
    }

    let athleteName: string | undefined;
    try {
      const athlete = await fetchStravaAthlete(access);
      athleteName =
        [athlete.firstname, athlete.lastname].filter(Boolean).join(" ") ||
        athlete.username;
    } catch {
      athleteName = undefined;
    }

    const ctx = await fetchCoachRecoveryContext(profile, access);
    const conversationHistory = await getTelegramCoachMemory(profile.id);

    if (hasPhoto && photos?.length) {
      const best = photos[photos.length - 1];
      const caption = msg.caption?.trim();
      const userQ = caption || PHOTO_DEFAULT_PROMPT;
      const { base64, mimeType } = await downloadTelegramFileAsBase64(
        best.file_id
      );
      const reply = await generateTelegramCoachPhotoReply({
        userMessage: userQ,
        imageBase64: base64,
        imageMimeType: mimeType,
        conversationHistory,
        stravaActivities: ctx.stravaActivities,
        recoveryDays: ctx.recoveryDays,
        recoverySource: ctx.recoverySource,
        athleteName,
      });
      await sendTelegramMessage(chatId, reply);
      await appendTelegramCoachExchange({
        coachProfileId: profile.id,
        userContent: `[Photo] ${userQ}`,
        assistantContent: reply,
      });
      return NextResponse.json({ ok: true });
    }

    if (text.length > 0) {
      const reply = await generateTelegramCoachChatReply({
        userMessage: text,
        conversationHistory,
        stravaActivities: ctx.stravaActivities,
        recoveryDays: ctx.recoveryDays,
        recoverySource: ctx.recoverySource,
        athleteName,
      });
      await sendTelegramMessage(chatId, reply);
      await appendTelegramCoachExchange({
        coachProfileId: profile.id,
        userContent: text,
        assistantContent: reply,
      });
      return NextResponse.json({ ok: true });
    }

    await sendTelegramMessage(
      chatId,
      "Send a short text question or a photo (add a caption if you want)."
    );
  } catch (e) {
    const m = e instanceof Error ? e.message : "Error";
    try {
      await sendTelegramMessage(
        chatId,
        m.includes("Garmin") || m.includes("Apple Health")
          ? "Link Garmin or Apple Health in FitShot Coach first so I have recovery data."
          : `Sorry, something went wrong: ${m.slice(0, 400)}`
      );
    } catch {
      /* ignore */
    }
  }

  return NextResponse.json({ ok: true });
}
