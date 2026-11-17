"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function BillingButton({
  plan,
  billing = "monthly",
  children,
  autoStart = false,
}: {
  plan: string;
  billing?: "monthly" | "annual";
  children: React.ReactNode;
  autoStart?: boolean;
}) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const started = useRef(false);

  const begin = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setPending(true);
    setStatus("Opening…");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan, billing }),
      });
      const payload = await response.json();
      if (response.status === 401) {
        const next = `/pricing?checkoutPlan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billing)}`;
        window.location.assign(`/sign-in?next=${encodeURIComponent(next)}`);
        return;
      }
      if (response.ok && payload.url) {
        window.location.assign(payload.url);
        return;
      }
      setStatus(payload.error || "Checkout unavailable");
      started.current = false;
      setPending(false);
    } catch {
      setStatus("Checkout is temporarily unavailable");
      started.current = false;
      setPending(false);
    }
  }, [billing, plan]);

  useEffect(() => {
    if (autoStart) void begin();
  }, [autoStart, begin]);

  return <div className="billing-action"><button className="button primary" type="button" onClick={begin} disabled={pending}>{children}</button><small aria-live="polite">{status}</small></div>;
}
