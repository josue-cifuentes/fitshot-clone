import type { CoachProfile } from "@prisma/client";
import {
  appleDaysJsonHasData,
  parseAppleHealthDaysJson,
} from "@/lib/apple-health";
import { decryptSecret, encryptSecret } from "@/lib/coach-crypto";
import { createGarminClientFromProfile } from "@/lib/garmin-client-from-profile";
import { fetchGarminRecoveryLastDays } from "@/lib/garmin-recovery";
import {
  generateTrainingRecommendation,
  type AiTrainingRecommendation,
} from "@/lib/gemini-coach";
import type { RecoveryDayForPrompt } from "@/lib/recovery-prompt";
import { prisma } from "@/lib/db";
import {
  appleDaysToPrompt,
  garminDaysToPrompt,
} from "@/lib/recovery-prompt";
import {
  fetchStravaActivitiesSince,
  refreshStravaAccessToken,
} from "@/lib/strava";
import { sendTelegramMessage } from "@/lib/telegram-notify";

export function profileHasGarminCredentials(
  profile: CoachProfile | null | undefined
): boolean {
  return Boolean(profile?.garminEmail && profile?.garminPasswordCipher);
}

export function profileHasAppleHealthData(
  profile: CoachProfile | null | undefined
): boolean {
  return appleDaysJsonHasData(profile?.appleHealthDaysJson);
}

export async function getStravaAccessFromStoredRefresh(
  profile: CoachProfile
): Promise<string | null> {
  if (
    !profile.stravaRefreshCipher ||
    !profile.stravaRefreshIv ||
    !profile.stravaRefreshTag
  ) {
    return null;
  }
  const refresh = decryptSecret({
    cipherText: profile.stravaRefreshCipher,
    iv: profile.stravaRefreshIv,
    tag: profile.stravaRefreshTag,
  });
  const tok = await refreshStravaAccessToken(refresh);
  if (tok.refresh_token && tok.refresh_token !== refresh) {
    const enc = encryptSecret(tok.refresh_token);
    await prisma.coachProfile.update({
      where: { stravaAthleteId: profile.stravaAthleteId },
      data: {
        stravaRefreshCipher: enc.cipherText,
        stravaRefreshIv: enc.iv,
        stravaRefreshTag: enc.tag,
      },
    });
  }
  return tok.access_token;
}

/** Strava (7d) + recovery context for Gemini (training recommendation + Telegram chat). */
export async function fetchCoachRecoveryContext(
  profile: CoachProfile,
  stravaAccessToken: string
): Promise<{
  stravaActivities: Awaited<ReturnType<typeof fetchStravaActivitiesSince>>;
  recoveryDays: RecoveryDayForPrompt[];
  recoverySource: "garmin" | "apple";
}> {
  const after = Math.floor(Date.now() / 1000) - 7 * 86400;
  const activities = await fetchStravaActivitiesSince(
    stravaAccessToken,
    after,
    50
  );

  if (profileHasGarminCredentials(profile)) {
    const gc = await createGarminClientFromProfile(profile);
    const { days } = await fetchGarminRecoveryLastDays(gc, 7);
    return {
      stravaActivities: activities,
      recoveryDays: garminDaysToPrompt(days),
      recoverySource: "garmin",
    };
  }

  if (!profileHasAppleHealthData(profile)) {
    throw new Error(
      "Connect Garmin or Apple Health and complete the first Health sync."
    );
  }

  const appleDays = parseAppleHealthDaysJson(profile.appleHealthDaysJson);
  const sorted = [...appleDays].sort((a, b) => a.date.localeCompare(b.date));
  const last7 = sorted.slice(-7);

  return {
    stravaActivities: activities,
    recoveryDays: appleDaysToPrompt(last7),
    recoverySource: "apple",
  };
}

async function computeRecommendation(
  profile: CoachProfile,
  stravaAccessToken: string
): Promise<AiTrainingRecommendation> {
  const ctx = await fetchCoachRecoveryContext(profile, stravaAccessToken);
  return generateTrainingRecommendation({
    stravaActivities: ctx.stravaActivities,
    recoveryDays: ctx.recoveryDays,
    recoverySource: ctx.recoverySource,
    athleteName: undefined,
  });
}

export async function generateAndSaveRecommendation(
  profile: CoachProfile,
  stravaAccessToken: string
): Promise<AiTrainingRecommendation> {
  const rec = await computeRecommendation(profile, stravaAccessToken);
  await prisma.coachProfile.update({
    where: { stravaAthleteId: profile.stravaAthleteId },
    data: {
      lastRecommendationJson: JSON.stringify(rec),
      lastRecommendationAt: new Date(),
    },
  });
  return rec;
}

export async function runCoachJobForProfile(
  profile: CoachProfile
): Promise<AiTrainingRecommendation> {
  const access = await getStravaAccessFromStoredRefresh(profile);
  if (!access) {
    throw new Error(
      "No Strava refresh token stored. Connect Strava once from this app."
    );
  }
  return generateAndSaveRecommendation(profile, access);
}

export function formatRecommendationTelegram(
  rec: AiTrainingRecommendation
): string {
  return (
    `🏃 FitShot AI Coach\n\n` +
    `Session: ${rec.type}\n` +
    `Duration: ${rec.durationMinutes} min\n` +
    `Intensity: ${rec.intensity}\n\n` +
    `${rec.reasoning}`
  );
}

export async function notifyProfileIfConfigured(
  profile: CoachProfile,
  rec: AiTrainingRecommendation
): Promise<void> {
  const chat = profile.telegramChatId?.trim();
  if (!chat) return;
  await sendTelegramMessage(chat, formatRecommendationTelegram(rec));
}
