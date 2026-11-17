"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function ProviderSignInButton({
  provider,
  callbackUrl,
}: {
  provider: "google" | "github";
  callbackUrl: string;
}) {
  const [pending, setPending] = useState(false);
  const label = provider === "google" ? "Continue with Google" : "Continue with GitHub";
  return (
    <button
      className={`provider-button provider-${provider}`}
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void signIn(provider, { callbackUrl }).catch(() => setPending(false));
      }}
    >
      <span aria-hidden="true">{provider === "google" ? "G" : "GH"}</span>
      {pending ? "Opening sign in…" : label}
    </button>
  );
}

