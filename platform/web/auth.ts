import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";

import { authProviderAvailability, publicAppUrl } from "@/lib/config";

const configured = authProviderAvailability();

const providers = [];
if (configured.google) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  );
}
if (configured.github) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  pages: { signIn: "/sign-in" },
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
