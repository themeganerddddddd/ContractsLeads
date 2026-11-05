"use client";

import { useState } from "react";

export function BillingPortalButton() {
  const [status, setStatus] = useState("");
  async function openPortal() {
    setStatus("Opening…");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const payload = await response.json();
      if (response.ok && payload.url) {
        window.location.assign(payload.url);
        return;
      }
      setStatus(payload.error || "Subscription management is unavailable");
    } catch {
      setStatus("Subscription management is temporarily unavailable");
    }
  }
  return <div className="billing-action"><button className="button secondary" type="button" onClick={openPortal} disabled={Boolean(status)}>Manage subscription</button><small aria-live="polite">{status}</small></div>;
}
