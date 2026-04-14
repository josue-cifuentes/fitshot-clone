import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret,
    secureCookie: process.env.NODE_ENV === "production",
  });

  const path = req.nextUrl.pathname;

  if (path.startsWith("/admin")) {
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const userEmail = (token?.email as string | undefined)?.trim().toLowerCase();
    const emailOk =
      Boolean(adminEmail && userEmail && userEmail === adminEmail);
    const adminAthleteId = process.env.ADMIN_STRAVA_ATHLETE_ID?.trim();
    const sid = token?.stravaAthleteId;
    const idOk =
      Boolean(
        adminAthleteId &&
          sid != null &&
          String(sid) === adminAthleteId
      );
    if (!token || (!emailOk && !idOk)) {
      return NextResponse.redirect(new URL("/coach", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  if (path.startsWith("/coach") && !token) {
    const login = new URL("/login", req.nextUrl.origin);
    login.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/coach", "/coach/:path*", "/admin", "/admin/:path*"],
};
