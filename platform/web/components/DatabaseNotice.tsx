import Link from "next/link";

/** Public, non-sensitive data-connectivity notice for preview and production pages. */
export function DatabaseNotice({ message: _message }: { message?: string }) {
  return (
    <section className="notice error-notice" role="status" aria-live="polite">
      <strong>Company intelligence data is not connected to this deployment</strong>
      <p>This view requires the BusinessCurrent database. No sample companies or predictions have been substituted. You can still explore federal awards through the separate official-source feed.</p>
      <div className="official-source-actions"><Link href="/contracts">Browse official federal awards ↗</Link> · <Link href="/api/status/public">Check connection status ↗</Link></div>
    </section>
  );
}
