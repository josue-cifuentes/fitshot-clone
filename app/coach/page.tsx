import type { Metadata } from "next";
import { CoachDashboard } from "./coach-dashboard";

export const metadata: Metadata = {
  title: "AI Coach",
  description:
    "Garmin recovery, Strava training load, and Gemini-powered daily recommendations.",
};

export default function CoachPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0A0A0A]">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 sm:max-w-xl sm:px-6 sm:py-10">
        <CoachDashboard />
      </div>
    </div>
  );
}
