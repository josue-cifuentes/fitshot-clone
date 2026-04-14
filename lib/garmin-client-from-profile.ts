import { GarminConnect } from "@flow-js/garmin-connect";
import type { IGarminTokens } from "@flow-js/garmin-connect/dist/garmin/types";
import type { CoachProfile } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/coach-crypto";

function decryptTokens(profile: CoachProfile): IGarminTokens | null {
  if (
    !profile.garminTokensCipher ||
    !profile.garminTokensIv ||
    !profile.garminTokensTag
  ) {
    return null;
  }
  try {
    const raw = decryptSecret({
      cipherText: profile.garminTokensCipher,
      iv: profile.garminTokensIv,
      tag: profile.garminTokensTag,
    });
    return JSON.parse(raw) as IGarminTokens;
  } catch {
    return null;
  }
}

export function encryptGarminTokens(tokens: IGarminTokens): {
  cipherText: string;
  iv: string;
  tag: string;
} {
  return encryptSecret(JSON.stringify(tokens));
}

export async function createGarminClientFromProfile(
  profile: CoachProfile
): Promise<GarminConnect> {
  const email = profile.garminEmail;
  if (!email) {
    throw new Error("Garmin email not configured");
  }
  const tokens = decryptTokens(profile);
  const gc = new GarminConnect({ username: email, password: "" });
  if (tokens) {
    try {
      gc.loadToken(tokens.oauth1, tokens.oauth2);
      await gc.getUserProfile();
      return gc;
    } catch {
      /* fall through to password login */
    }
  }
  if (
    !profile.garminPasswordCipher ||
    !profile.garminPasswordIv ||
    !profile.garminPasswordTag
  ) {
    throw new Error("Garmin password not stored; reconnect Garmin.");
  }
  const password = decryptSecret({
    cipherText: profile.garminPasswordCipher,
    iv: profile.garminPasswordIv,
    tag: profile.garminPasswordTag,
  });
  const fresh = new GarminConnect({ username: email, password });
  await fresh.login(email, password);
  const exported = fresh.exportToken();
  return fresh;
}
