"use client";

import { useState } from "react";

export function WatchCompanyButton({ companyId, compact = false }: { companyId: string; compact?: boolean }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  async function watch() {
    setStatus("saving");
    const response = await fetch("/api/company-watches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ company_id: companyId }) });
    setStatus(response.ok ? "saved" : "error");
  }
  return <button className={compact ? "table-action button-reset" : "button secondary"} type="button" onClick={watch} disabled={status === "saving" || status === "saved"} aria-live="polite">
    {status === "saved" ? "Tracked" : status === "saving" ? "Saving…" : status === "error" ? "Try again" : compact ? "Track" : "Track company"}
  </button>;
}
