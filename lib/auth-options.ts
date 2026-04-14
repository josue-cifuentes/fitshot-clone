import type { NextAuthOptions } from "next-auth";
import Strava from "next-auth/providers/strava";
import {
  fetchStravaAthlete,
  refreshStravaAccessToken,
} from "@/lib/strava";

function trimEnv(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : undefined;
}

/** Help NextAuth resolve the site URL when NEXTAUTH_URL is unset (local dev). */
if (!process.env.NEXTAUTH_URL) {
  const pub = trimEnv("NEXT_PUBLIC_APP_URL");
  if (pub) {
    process.env.NEXTAUTH_URL = pub.replace(/\/$/, "");
  }
}

const stravaClientId = trimEnv("STRAVA_CLIENT_ID");
const stravaClientSecret = trimEnv("STRAVA_CLIENT_SECRET");

try {
  console.log("[next-auth] Initializing authOptions", {
    hasNextAuthUrl: Boolean(trimEnv("NEXTAUTH_URL")),
    hasNextAuthSecret: Boolean(trimEnv("NEXTAUTH_SECRET")),
    hasStravaClientId: Boolean(stravaClientId),
    hasStravaClientSecret: Boolean(stravaClientSecret),
  });
} catch (e) {
  console.error("[next-auth] Error logging auth env diagnostics:", e);
}

export const authOptions: NextAuthOptions = {
  secret: trimEnv("NEXTAUTH_SECRET"),
  debug: process.env.NODE_ENV === "development",
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [
    Strava({
      clientId: stravaClientId ?? "",
      clientSecret: stravaClientSecret ?? "",
      authorization: {
        params: {
          scope: "read,activity:read_all",
          approval_prompt: "auto",
          response_type: "code",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token && account.refresh_token) {
        const accessToken = account.access_token as string;
        const refreshToken = account.refresh_token as string;
        const expiresIn = (account.expires_in as number) ?? 21600;

        let athlete;
        try {
          athlete = await fetchStravaAthlete(accessToken);
        } catch {
          return token;
        }

        const displayName =
          [athlete.firstname, athlete.lastname].filter(Boolean).join(" ").trim() ||
          athlete.username;

        token.stravaAthleteId = athlete.id;
        token.name = displayName;
        token.email = athlete.email ?? undefined;
        token.picture = athlete.profile;
        token.accessToken = accessToken;
        token.refreshToken = refreshToken;
        token.expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

        if (process.env.DATABASE_URL && process.env.COACH_ENCRYPTION_KEY) {
          try {
            const [{ prisma }, { encryptSecret }] = await Promise.all([
              import("@/lib/db"),
              import("@/lib/coach-crypto"),
            ]);
            const enc = encryptSecret(refreshToken);
            await prisma.coachProfile.upsert({
              where: { stravaAthleteId: athlete.id },
              create: {
                stravaAthleteId: athlete.id,
                stravaEmail: athlete.email?.trim() || null,
                stravaUsername: athlete.username,
                stravaDisplayName: displayName,
                stravaRefreshCipher: enc.cipherText,
                stravaRefreshIv: enc.iv,
                stravaRefreshTag: enc.tag,
              },
              update: {
                stravaEmail: athlete.email?.trim() || null,
                stravaUsername: athlete.username,
                stravaDisplayName: displayName,
                stravaRefreshCipher: enc.cipherText,
                stravaRefreshIv: enc.iv,
                stravaRefreshTag: enc.tag,
              },
            });
          } catch (e) {
            console.error("CoachProfile upsert on Strava sign-in:", e);
          }
        }
        return token;
      }

      if (
        token.refreshToken &&
        token.expiresAt !== undefined &&
        typeof token.expiresAt === "number"
      ) {
        const now = Math.floor(Date.now() / 1000);
        if (now > token.expiresAt - 120) {
          try {
            const t = await refreshStravaAccessToken(token.refreshToken as string);
            token.accessToken = t.access_token;
            token.refreshToken = t.refresh_token;
            token.expiresAt =
              t.expires_at ??
              Math.floor(Date.now() / 1000) + (t.expires_in ?? 21600);

            if (
              process.env.DATABASE_URL &&
              process.env.COACH_ENCRYPTION_KEY &&
              t.refresh_token &&
              token.stravaAthleteId != null
            ) {
              const [{ prisma }, { encryptSecret }] = await Promise.all([
                import("@/lib/db"),
                import("@/lib/coach-crypto"),
              ]);
              const enc = encryptSecret(t.refresh_token);
              await prisma.coachProfile.updateMany({
                where: { stravaAthleteId: token.stravaAthleteId as number },
                data: {
                  stravaRefreshCipher: enc.cipherText,
                  stravaRefreshIv: enc.iv,
                  stravaRefreshTag: enc.tag,
                },
              });
            }
          } catch (e) {
            console.error("Strava access refresh in JWT callback:", e);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.stravaAthleteId != null) {
        session.user.stravaAthleteId = token.stravaAthleteId as number;
      }
      if (token.name) session.user.name = token.name as string;
      if (token.email) session.user.email = token.email as string;
      if (token.picture) session.user.image = token.picture as string;
      return session;
    },
  },
};
