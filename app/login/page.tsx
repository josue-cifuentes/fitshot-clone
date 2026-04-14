import type { Metadata } from "next";
import { StravaSignInForm } from "./strava-sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: "noindex, nofollow",
};

const errorMessages: Record<string, string> = {
  access_denied: "Strava authorization was cancelled.",
  OAuthAccountNotLinked: "This account could not be linked. Try again.",
  server: "Something went wrong during sign-in. Try again.",
  Configuration: "Server configuration error. Check NEXTAUTH_URL, NEXTAUTH_SECRET, and Strava credentials.",
  OAuthSignin: "Could not start Strava sign-in. Check STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET and Strava app settings.",
  OAuthCallback: "Strava returned an error after authorization. Try again.",
  Callback: "Sign-in callback failed. Try again.",
  Default: "Sign-in failed.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const nextPath =
    typeof callbackUrl === "string" && callbackUrl.length > 0
      ? callbackUrl
      : "/coach";
  const errorMessage = error
    ? errorMessages[error] ?? errorMessages.Default
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#0A0A0A] px-4 py-8 sm:px-6 sm:py-12">
      <main className="glass-panel w-full max-w-md rounded-2xl p-5 sm:p-8">
        <h1 className="text-xl font-bold tracking-tight text-[#F5F5F5] sm:text-2xl">
          Sign in
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#F5F5F5]/55 sm:text-base">
          Use your Strava account to continue. You will be redirected to Strava to
          approve access.
        </p>

        {errorMessage ? (
          <p
            className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200"
            role="alert"
          >
            {errorMessage}
            {error && !errorMessages[error] ? (
              <span className="mt-1 block text-xs text-red-200/70">
                (code: {error})
              </span>
            ) : null}
          </p>
        ) : null}

        <StravaSignInForm callbackUrl={nextPath} />
      </main>
    </div>
  );
}
