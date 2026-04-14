"use server";

import { redirect } from "next/navigation";

export async function signInWithStrava(formData: FormData) {
  const cb = formData.get("callbackUrl");
  const callbackUrl =
    typeof cb === "string" && cb.startsWith("/") && !cb.startsWith("//")
      ? cb
      : "/coach";
  redirect(
    `/api/auth/signin/strava?callbackUrl=${encodeURIComponent(callbackUrl)}`
  );
}
