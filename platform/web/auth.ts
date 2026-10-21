import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

import { authEnabled, publicAppUrl } from "@/lib/config";

const githubConfigured = Boolean(
  authEnabled() &&
    process.env.AUTH_GITHUB_ID &&
    process.env.AUTH_GITHUB_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: githubConfigured
    ? [
        GitHub({
          clientId: process.env.AUTH_GITHUB_ID!,
          clientSecret: process.env.AUTH_GITHUB_SECRET!,
        }),
      ]
    : [],
  session: { strategy: "jwt" },
  secret:
    process.env.AUTH_SECRET ||
    (process.env.NODE_ENV === "development"
      ? "development-only-not-a-production-secret"
      : undefined),
  trustHost: true,
  callbacks: {
    redirect({ url }) {
      const appOrigin = publicAppUrl();
      if (url.startsWith("/")) return `${appOrigin}${url}`;
      try {
        return new URL(url).origin === appOrigin ? url : appOrigin;
      } catch {
        return appOrigin;
      }
    },
  },
});
