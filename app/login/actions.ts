"use server";

import { signIn } from "@/auth";

export async function signInWithStrava(formData: FormData) {
  const cb = formData.get("callbackUrl");
  const redirectTo =
    typeof cb === "string" && cb.startsWith("/") && !cb.startsWith("//")
      ? cb
      : "/coach";
  await signIn("strava", { redirectTo });
}
