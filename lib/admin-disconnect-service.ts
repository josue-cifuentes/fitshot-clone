import type { CoachProfile } from "@prisma/client";
import { getStravaAccessFromStoredRefresh } from "@/lib/coach-pipeline";
import { prisma } from "@/lib/db";
import { deauthorizeStravaAccessToken } from "@/lib/strava";

export type AdminDisconnectService =
  | "strava"
  | "garmin"
  | "apple"
  | "telegram";

export async function disconnectServiceForProfile(
  profileId: string,
  service: AdminDisconnectService
): Promise<void> {
  const profile = await prisma.coachProfile.findUnique({
    where: { id: profileId },
  });
  if (!profile) {
    throw new Error("Profile not found");
  }

  switch (service) {
    case "strava":
      await disconnectStravaForProfile(profile);
      return;
    case "garmin":
      await prisma.coachProfile.update({
        where: { id: profileId },
        data: {
          garminEmail: null,
          garminPasswordCipher: null,
          garminPasswordIv: null,
          garminPasswordTag: null,
          garminTokensCipher: null,
          garminTokensIv: null,
          garminTokensTag: null,
        },
      });
      return;
    case "apple":
      await prisma.coachProfile.update({
        where: { id: profileId },
        data: {
          healthExportToken: null,
          appleHealthDaysJson: null,
          appleHealthLastSyncAt: null,
        },
      });
      return;
    case "telegram":
      await prisma.coachProfile.update({
        where: { id: profileId },
        data: {
          telegramChatId: null,
          telegramLinkToken: null,
        },
      });
      return;
  }
}

async function disconnectStravaForProfile(profile: CoachProfile): Promise<void> {
  try {
    const access = await getStravaAccessFromStoredRefresh(profile);
    if (access) {
      await deauthorizeStravaAccessToken(access);
    }
  } catch (e) {
    console.warn("admin strava deauthorize:", e);
  }

  await prisma.coachProfile.update({
    where: { id: profile.id },
    data: {
      stravaRefreshCipher: null,
      stravaRefreshIv: null,
      stravaRefreshTag: null,
    },
  });
}
