"use client";

import { useState } from "react";

export function WatchCompanyButton({ companyId }: { companyId: string }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  async function watch() {
    setStatus("saving");
    const response = await fetch("/api/company-watches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: companyId }) });
    setStatus(response.ok ? "saved" : "error");
  }
  return <button className="button secondary" type="button" onClick={watch} disabled={status === "saving" || status === "saved"} aria-live="polite">
    {status === "saved" ? "Watching" : status === "saving" ? "Saving…" : status === "error" ? "Try again" : "Watch company"}
  </button>;
}
