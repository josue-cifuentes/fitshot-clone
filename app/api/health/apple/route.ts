import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { mergeAppleHealthIntoStoredJson } from "@/lib/apple-health";

export const dynamic = "force-dynamic";

/**
 * Apple Health webhook (iOS Shortcuts JSON POST, legacy Health Auto Export):
 * `GET|POST /api/health/apple?token=YOUR_TOKEN`
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const profile = await prisma.coachProfile.findFirst({
    where: { healthExportToken: token },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    message: "FitShot Apple Health webhook is active. Use POST with JSON body for sync.",
  });
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const profile = await prisma.coachProfile.findFirst({
    where: { healthExportToken: token },
  });
  if (!profile) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: unknown;
  const ct = request.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      body = await request.json();
    } else {
      const text = await request.text();
      body = text.trim() ? JSON.parse(text) : {};
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { mergedJson } = mergeAppleHealthIntoStoredJson(
    profile.appleHealthDaysJson,
    body
  );

  await prisma.coachProfile.update({
    where: { id: profile.id },
    data: {
      appleHealthDaysJson: mergedJson,
      appleHealthLastSyncAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
