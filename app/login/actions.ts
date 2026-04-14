"use server";

import { redirect } from "next/navigation";

export async function signInWithStrava(formData: FormData) {
  const cb = formData.get("callbackUrl");
  const params = new URLSearchParams();
  if (typeof cb === "string" && cb.length > 0) {
    params.set("callbackUrl", cb);
  }
  const qs = params.toString();
  redirect(qs ? `/api/auth/signin/strava?${qs}` : "/api/auth/signin/strava");
}
