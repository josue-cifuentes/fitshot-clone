import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStravaAthleteIdFromCookies } from "@/lib/coach-auth";

export async function POST(request: Request) {
  try {
    const athleteId = await getStravaAthleteIdFromCookies();
    if (!athleteId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { type, calories, description, userProfileId } = body;

    const entry = await prisma.calorieEntry.create({
      data: {
        type,
        calories,
        description,
        userProfileId,
      },
    });

    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const athleteId = await getStravaAthleteIdFromCookies();
    if (!athleteId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

    await prisma.calorieEntry.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
