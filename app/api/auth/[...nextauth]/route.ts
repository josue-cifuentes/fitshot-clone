import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth-options";

/**
 * App Router handler for NextAuth v4 (`/api/auth/*`).
 * Do not use GET `/api/auth/signin/:provider` with `pages.signIn` — it misroutes OAuth.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
