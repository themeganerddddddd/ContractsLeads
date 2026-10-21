import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const githubConfigured = Boolean(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: githubConfigured
    ? [GitHub({ clientId: process.env.AUTH_GITHUB_ID!, clientSecret: process.env.AUTH_GITHUB_SECRET! })]
    : [],
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET || (process.env.NODE_ENV === "development" ? "development-only-not-a-production-secret" : undefined),
  trustHost: true
});
