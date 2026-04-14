import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-auth";
import {
  disconnectServiceForProfile,
  type AdminDisconnectService,
} from "@/lib/admin-disconnect-service";

export const dynamic = "force-dynamic";

const SERVICES: AdminDisconnectService[] = [
  "strava",
  "garmin",
  "apple",
  "telegram",
];

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Database not configured." },
      { status: 503 }
    );
  }

  const auth = await verifyAdminSession();
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { profileId?: string; service?: string };
  try {
    body = (await request.json()) as { profileId?: string; service?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const profileId = body.profileId?.trim();
  const service = body.service as AdminDisconnectService | undefined;
  if (!profileId || !service || !SERVICES.includes(service)) {
    return NextResponse.json(
      { error: "Missing profileId or invalid service" },
      { status: 400 }
    );
  }

  try {
    await disconnectServiceForProfile(profileId, service);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Disconnect failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
