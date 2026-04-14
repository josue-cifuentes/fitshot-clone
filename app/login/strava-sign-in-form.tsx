"use client";

import { getCsrfToken } from "next-auth/react";
import { useEffect, useState } from "react";

type Props = {
  callbackUrl: string;
};

/**
 * NextAuth v4 starts OAuth with a POST to `/api/auth/signin/:provider` and a CSRF token.
 * A GET to that URL with `pages.signIn` set incorrectly treats the provider id as `error=`.
 */
export function StravaSignInForm({ callbackUrl }: Props) {
  const [csrfToken, setCsrfToken] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = (await getCsrfToken()) ?? "";
        if (!cancelled) {
          setCsrfToken(token);
          setReady(true);
        }
      } catch (e) {
        console.error("[login] getCsrfToken failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <form
      action="/api/auth/signin/strava"
      method="post"
      className="mt-6 sm:mt-8"
    >
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <button
        type="submit"
        disabled={!ready}
        className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-[#E8FF00] px-5 text-base font-bold text-[#0A0A0A] shadow-lg shadow-[#E8FF00]/15 transition hover:brightness-110 active:scale-[0.99] enabled:cursor-pointer disabled:cursor-wait disabled:opacity-60 sm:min-h-16"
      >
        {ready ? "Sign in with Strava" : "Preparing…"}
      </button>
    </form>
  );
}
