import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifyAdminSession } from "@/lib/admin-auth";
import { appleDaysJsonHasData } from "@/lib/apple-health";
import { profileHasGarminCredentials } from "@/lib/coach-pipeline";
import { prisma } from "@/lib/db";
import {
  AdminUsersTable,
  type AdminUserRow,
} from "./admin-users-table";

export const metadata: Metadata = {
  title: "Admin",
  robots: "noindex, nofollow",
};

export default async function AdminPage() {
  if (!process.env.DATABASE_URL) {
    redirect("/");
  }

  const auth = await verifyAdminSession();
  if (!auth.ok) {
    redirect("/");
  }

  const profiles = await prisma.coachProfile.findMany({
    orderBy: { createdAt: "desc" },
  });

  const users: AdminUserRow[] = profiles.map((p) => ({
    id: p.id,
    name:
      p.stravaDisplayName?.trim() ||
      p.stravaUsername?.trim() ||
      `Strava #${p.stravaAthleteId}`,
    email: p.stravaEmail?.trim() || "—",
    stravaAthleteId: p.stravaAthleteId,
    services: {
      strava: Boolean(
        p.stravaRefreshCipher && p.stravaRefreshIv && p.stravaRefreshTag
      ),
      garmin: profileHasGarminCredentials(p),
      apple:
        Boolean(p.healthExportToken?.trim()) ||
        appleDaysJsonHasData(p.appleHealthDaysJson),
      telegram: Boolean(p.telegramChatId?.trim()),
    },
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0A0A0A]">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8FF00]">
            Admin
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#F5F5F5]">
            Users
          </h1>
          <p className="mt-2 text-sm text-[#F5F5F5]/55">
            Coach connections per Strava account. Disconnect actions apply
            immediately.
          </p>
        </header>

        <div className="glass-panel rounded-2xl p-4 sm:p-5">
          <AdminUsersTable users={users} />
        </div>
      </div>
    </div>
  );
}
