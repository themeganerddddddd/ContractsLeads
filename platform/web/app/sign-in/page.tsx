import Link from "next/link";

import { ProviderSignInButton } from "@/components/ProviderSignInButton";
import { authProviderAvailability } from "@/lib/config";

type RawParams = Record<string, string | string[] | undefined>;

export const metadata = {
  title: "Sign in",
  description: "Sign in to BusinessCurrent to save, track, subscribe, and manage your account.",
};

function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/companies";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = await searchParams;
  const callbackUrl = safeNext(raw.next);
  const providers = authProviderAvailability();
  const anyProvider = providers.google || providers.github;
  return (
    <section className="auth-shell">
      <div className="auth-card">
        <Link className="auth-brand" href="/">
          <span className="brand-mark" aria-hidden="true">BC</span>
          BusinessCurrent
        </Link>
        <p className="eyebrow">Your company intelligence workspace</p>
        <h1>Sign in to BusinessCurrent</h1>
        <p>
          Save searches, track companies, manage alerts, and continue to your
          subscription without losing your place.
        </p>
        <div className="provider-stack">
          {providers.google ? (
            <ProviderSignInButton provider="google" callbackUrl={callbackUrl} />
          ) : null}
          {providers.github ? (
            <ProviderSignInButton provider="github" callbackUrl={callbackUrl} />
          ) : null}
        </div>
        {!anyProvider ? (
          <div className="auth-unavailable">
            <strong>Sign-in is not configured yet.</strong>
            <p>You can still search public company intelligence while access is prepared.</p>
          </div>
        ) : null}
        <small>
          By continuing, you agree to the <Link href="/terms">Terms</Link> and
          acknowledge the <Link href="/privacy">Privacy notice</Link>.
        </small>
        <Link className="text-action" href="/companies">Continue browsing without signing in →</Link>
      </div>
    </section>
  );
}

