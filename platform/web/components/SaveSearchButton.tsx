"use client";

import { useState } from "react";

export function SaveSearchButton({ query }: { query: Record<string, unknown> }) {
  const [status, setStatus] = useState("");
  async function save() {
    const name = window.prompt("Name this search");
    if (!name) return;
    setStatus("Saving…");
    const response = await fetch("/api/saved-searches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, query_json: query, alert_frequency: "none" }) });
    const payload = await response.json();
    setStatus(response.ok ? "Saved" : payload.error || "Could not save");
  }
  return <span className="save-control"><button className="button secondary" type="button" onClick={save}>Save search</button><small aria-live="polite">{status}</small></span>;
}
