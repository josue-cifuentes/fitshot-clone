import { NextResponse } from "next/server";

/** Use for unexpected failures in API route catch blocks (always valid JSON). */
export function internalServerErrorJson() {
  return NextResponse.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
