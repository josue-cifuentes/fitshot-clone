import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  STRAVA_OAUTH_STATE_COOKIE,
  buildStravaAuthorizationUrl,
} from "@/lib/strava";

async function startStravaOAuth() {
  "use server";
  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set(STRAVA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  redirect(buildStravaAuthorizationUrl(state));
}

const errorMessages: Record<string, string> = {
  access_denied: "Strava authorization was cancelled.",
  invalid_state: "Security check failed. Please try connecting again.",
  missing_code: "Strava did not return an authorization code.",
  token_exchange:
    "Could not exchange the code for a token. Check your client ID and secret.",
};

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? errorMessages[error] ?? "Something went wrong." : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#0A0A0A] px-4 py-8 sm:px-6 sm:py-12">
      <main className="glass-panel w-full max-w-md rounded-2xl p-5 sm:p-8">
        <h1 className="text-xl font-bold tracking-tight text-[#F5F5F5] sm:text-2xl">
          Connect Strava
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#F5F5F5]/55 sm:text-base">
          Link your Strava account to load recent activities and stats. You will
          be redirected to Strava to approve access.
        </p>

        {message ? (
          <p
            className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200"
            role="alert"
          >
            {message}
          </p>
        ) : null}

        <form action={startStravaOAuth} className="mt-6 sm:mt-8">
          <button
            type="submit"
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#E8FF00] px-5 text-base font-bold text-[#0A0A0A] shadow-lg shadow-[#E8FF00]/15 transition hover:brightness-110 active:scale-[0.99] sm:min-h-16"
          >
            Connect with Strava
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-[#F5F5F5]/45 sm:mt-6 sm:text-sm">
          Use the bar below to jump home or open the editor after connecting.
        </p>
      </main>
    </div>
  );
}
