/**
 * Auth.js (v5) configuration.
 *
 * Phase 1: Google OAuth when credentials are present in .env, JWT
 * sessions, no database adapter (identity lives in Postgres but
 * session state stays in the JWT for now). Email magic-link lands in
 * Phase 2 along with the adapter.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: googleConfigured ? [Google] : [],
});
