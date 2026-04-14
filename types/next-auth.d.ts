import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      stravaAthleteId?: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    stravaAthleteId?: number;
    accessToken?: string;
    refreshToken?: string;
    /** Unix seconds when access token expires */
    expiresAt?: number;
  }
}
