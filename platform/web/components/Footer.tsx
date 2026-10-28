import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <strong>Federal Ledger</strong>
        <p>Location-first business change intelligence backed by retained official-source evidence. Government procurement remains a distinct context layer.</p>
      </div>
      <div className="footer-links">
        <Link href="/business-change">Business Radar</Link>
        <Link href="/companies">Companies</Link>
        <Link href="/search">Procurement</Link>
        <Link href="/data-coverage">Data Coverage</Link>
        <Link href="/pricing">Plans</Link>
      </div>
    </footer>
  );
}
