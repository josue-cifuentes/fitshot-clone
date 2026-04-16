"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#0A0A0A] px-4 py-8 sm:px-6 sm:py-12">
      <main className="glass-panel w-full max-w-md rounded-2xl p-5 sm:p-8">
        <h1 className="text-xl font-bold tracking-tight text-[#F5F5F5] sm:text-2xl">
          Connect Strava
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#F5F5F5]/55 sm:text-base">
          Connect your Strava account to get started with FitShot.
        </p>

        {error && (
          <p
            className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-200"
            role="alert"
          >
            Connection failed. Please try again.
          </p>
        )}

        <Link
          href="/api/auth/strava/login"
          prefetch={false}
          className="mt-8 flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#E8FF00] px-5 text-base font-bold text-[#0A0A0A] shadow-lg shadow-[#E8FF00]/15 transition hover:brightness-110 active:scale-[0.99] sm:min-h-16"
        >
          Connect with Strava
        </Link>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#0A0A0A]">
        <div className="text-[#F5F5F5]/50">Loading...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
