import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <div className="footer-brand"><span className="brand-mark" aria-hidden="true">BC</span><strong>BusinessCurrent <small>Beta</small></strong></div>
        <p>Business change intelligence, nationwide. Every signal is tied to evidence. Missing coverage stays visible.</p>
      </div>
      <div className="footer-links">
        <Link href="/business-change">Radar</Link>
        <Link href="/companies">Companies</Link>
        <Link href="/locations">Markets</Link>
        <Link href="/search">Government Business</Link>
        <Link href="/data-coverage">Coverage</Link>
        <Link href="/methodology">Methodology</Link>
        <Link href="/pricing">Plans</Link>
      </div>
    </footer>
  );
}
