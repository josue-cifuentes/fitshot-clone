"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  stravaAthleteId: number;
  services: {
    strava: boolean;
    garmin: boolean;
    apple: boolean;
    telegram: boolean;
  };
};

type Service = "strava" | "garmin" | "apple" | "telegram";

const LABEL: Record<Service, string> = {
  strava: "Strava",
  garmin: "Garmin",
  apple: "Apple Health",
  telegram: "Telegram",
};

function SvcIcon({ on }: { on: boolean }) {
  return on ? (
    <span className="text-emerald-400">✓</span>
  ) : (
    <span className="text-[#F5F5F5]/25">—</span>
  );
}

export function AdminUsersTable({ users }: { users: AdminUserRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  async function disconnect(profileId: string, service: Service) {
    if (!confirm("Are you sure?")) return;
    const key = `${profileId}:${service}`;
    setPending(key);
    try {
      const res = await fetch("/api/admin/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ profileId, service }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Request failed");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead>
          <tr className="border-b border-[#F5F5F5]/15 text-[#F5F5F5]/50">
            <th className="pb-3 pr-3 font-medium">Name</th>
            <th className="pb-3 pr-3 font-medium">Email</th>
            <th className="pb-3 pr-3 font-medium">Strava</th>
            <th className="pb-3 pr-3 font-medium">Garmin</th>
            <th className="pb-3 pr-3 font-medium">Apple</th>
            <th className="pb-3 pr-3 font-medium">Telegram</th>
            <th className="pb-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="text-[#F5F5F5]/90">
          {users.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-6 text-center text-[#F5F5F5]/45">
                No coach profiles yet.
              </td>
            </tr>
          ) : (
            users.map((u) => (
              <tr
                key={u.id}
                className="border-t border-[#F5F5F5]/10 align-top"
              >
                <td className="py-3 pr-3 font-medium text-[#F5F5F5]">
                  {u.name}
                  <span className="mt-0.5 block text-xs font-normal text-[#F5F5F5]/40">
                    id {u.stravaAthleteId}
                  </span>
                </td>
                <td className="py-3 pr-3">{u.email}</td>
                <td className="py-3 pr-3">
                  <SvcIcon on={u.services.strava} />
                </td>
                <td className="py-3 pr-3">
                  <SvcIcon on={u.services.garmin} />
                </td>
                <td className="py-3 pr-3">
                  <SvcIcon on={u.services.apple} />
                </td>
                <td className="py-3 pr-3">
                  <SvcIcon on={u.services.telegram} />
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {(["strava", "garmin", "apple", "telegram"] as const).map(
                      (svc) => (
                        <button
                          key={svc}
                          type="button"
                          disabled={
                            pending === `${u.id}:${svc}` || !u.services[svc]
                          }
                          onClick={() => void disconnect(u.id, svc)}
                          className="rounded-lg border border-red-500/40 px-2 py-1 text-xs font-semibold text-red-200/90 transition hover:bg-red-950/35 disabled:cursor-not-allowed disabled:opacity-35"
                          title={`Disconnect ${LABEL[svc]}`}
                        >
                          {LABEL[svc].split(" ")[0]}
                        </button>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
