import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  STRAVA_ACCESS_TOKEN_COOKIE,
  fetchStravaActivities,
  formatCalories,
  formatCadence,
  formatDistanceMeters,
  formatDuration,
  formatElevationMeters,
  formatHeartRate,
  formatSpeedMps,
  type StravaActivity,
} from "@/lib/strava";

function formatActivityStart(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ActivityCard({ activity }: { activity: StravaActivity }) {
  const label = activity.sport_type ?? activity.type;
  const showHr =
    activity.has_heartrate ||
    (activity.average_heartrate != null && activity.average_heartrate > 0);

  return (
    <article className="glass-panel rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#F5F5F5] sm:text-lg">
            {activity.name || "Untitled activity"}
          </h2>
          <p className="mt-0.5 text-xs text-[#F5F5F5]/50 sm:text-sm">
            {formatActivityStart(activity.start_date)} · {label}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs sm:mt-4 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-3 sm:text-sm">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#F5F5F5]/45">
            Distance
          </dt>
          <dd className="mt-0.5 font-semibold text-[#E8FF00]">
            {formatDistanceMeters(activity.distance)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#F5F5F5]/45">
            Moving time
          </dt>
          <dd className="mt-0.5 font-semibold text-[#E8FF00]">
            {formatDuration(activity.moving_time)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#F5F5F5]/45">
            Elapsed
          </dt>
          <dd className="mt-0.5 font-medium text-[#F5F5F5]">
            {formatDuration(activity.elapsed_time)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#F5F5F5]/45">
            Avg speed
          </dt>
          <dd className="mt-0.5 font-medium text-[#F5F5F5]">
            {formatSpeedMps(activity.average_speed)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#F5F5F5]/45">
            Max speed
          </dt>
          <dd className="mt-0.5 font-medium text-[#F5F5F5]">
            {formatSpeedMps(activity.max_speed)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#F5F5F5]/45">
            Elevation
          </dt>
          <dd className="mt-0.5 font-medium text-[#F5F5F5]">
            {formatElevationMeters(activity.total_elevation_gain)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#F5F5F5]/45">
            Avg HR
          </dt>
          <dd className="mt-0.5 font-medium text-[#F5F5F5]">
            {showHr
              ? formatHeartRate(activity.average_heartrate ?? undefined)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#F5F5F5]/45">
            Max HR
          </dt>
          <dd className="mt-0.5 font-medium text-[#F5F5F5]">
            {showHr
              ? formatHeartRate(activity.max_heartrate ?? undefined)
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#F5F5F5]/45">
            Calories
          </dt>
          <dd className="mt-0.5 font-medium text-[#F5F5F5]">
            {formatCalories(activity.calories ?? undefined)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#F5F5F5]/45">
            Cadence
          </dt>
          <dd className="mt-0.5 font-medium text-[#F5F5F5]">
            {formatCadence(activity.average_cadence ?? undefined)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default async function ActivitiesPage() {
  const token = (await cookies()).get(STRAVA_ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    redirect("/connect");
  }

  let activities: StravaActivity[];
  try {
    activities = await fetchStravaActivities(token, 10);
  } catch {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#0A0A0A] px-4 py-10 sm:px-6">
        <main className="w-full max-w-lg text-center">
          <h1 className="text-lg font-semibold text-[#F5F5F5] sm:text-xl">
            Could not load activities
          </h1>
          <p className="mt-2 text-sm text-[#F5F5F5]/55">
            Your session may have expired or Strava returned an error. Connect
            again from the link below.
          </p>
          <Link
            href="/connect"
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#E8FF00] px-6 text-sm font-bold text-[#0A0A0A] sm:min-h-14 sm:text-base"
          >
            Reconnect Strava
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0A0A0A]">
      <div className="mx-auto w-full max-w-3xl flex-1 px-3 py-4 sm:px-4 sm:py-8 lg:px-6">
        <header className="mb-5 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#F5F5F5] sm:text-2xl">
              Recent activities
            </h1>
            <p className="mt-1 text-xs text-[#F5F5F5]/50 sm:text-sm">
              Last 10 activities from Strava
            </p>
          </div>
          <Link
            href="/connect"
            className="text-xs font-semibold text-[#E8FF00] underline-offset-4 hover:underline sm:text-sm"
          >
            Account / reconnect
          </Link>
        </header>

        {activities.length === 0 ? (
          <p className="glass-panel rounded-2xl px-4 py-10 text-center text-sm text-[#F5F5F5]/55 sm:py-12">
            No activities found.
          </p>
        ) : (
          <ul className="flex flex-col gap-3 sm:gap-4">
            {activities.map((activity) => (
              <li key={activity.id}>
                <ActivityCard activity={activity} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
