"use client";

import dynamic from "next/dynamic";
import type { StravaActivity } from "@/lib/strava";

const PhotoEditor = dynamic(() => import("./photo-editor"), { ssr: false });

export function EditorShell({
  activities,
  appUrl,
}: {
  activities: StravaActivity[];
  appUrl: string;
}) {
  return <PhotoEditor activities={activities} appUrl={appUrl} />;
}
