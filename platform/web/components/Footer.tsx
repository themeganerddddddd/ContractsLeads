import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <strong>Federal Ledger</strong>
        <p>Market intelligence derived from official federal award data. Obligations are not economic-impact estimates.</p>
      </div>
      <div className="footer-links">
        <Link href="/pricing">Plans</Link>
        <a href="https://www.usaspending.gov/" rel="noreferrer" target="_blank">USAspending.gov ↗</a>
      </div>
    </footer>
  );
}
