"use client";

import { useState } from "react";

export function BillingButton({ plan, billing = "monthly", children }: { plan: string; billing?: string; children: React.ReactNode }) {
  const [status, setStatus] = useState("");
  async function begin() {
    setStatus("Opening…");
    const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan, billing }) });
    const payload = await response.json();
    if (response.ok && payload.url) window.location.assign(payload.url);
    else setStatus(payload.error || "Checkout unavailable");
  }
  return <><button className="button primary" type="button" onClick={begin}>{children}</button><small aria-live="polite">{status}</small></>;
}
