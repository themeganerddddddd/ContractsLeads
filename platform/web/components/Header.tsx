import Link from "next/link";

const primaryLinks = [
  ["Business Radar", "/business-change"],
  ["Companies", "/companies"],
  ["Tracking", "/tracked-companies"],
  ["Procurement", "/search"],
  ["Coverage", "/data-coverage"],
] as const;

const moreLinks = [
  ["Alerts", "/alerts"],
  ["Saved searches", "/saved-searches"],
  ["Movements", "/movements"],
  ["Business formation", "/business-formation"],
  ["Industries", "/industries"],
  ["Agencies", "/agencies"],
  ["Locations", "/locations"],
  ["Pricing", "/pricing"],
] as const;

export function Header() {
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Link className="brand" href="/" aria-label="Federal Ledger home">
          <span className="brand-mark" aria-hidden="true">FL</span>
          <span><strong>Federal Ledger</strong><small>Business change intelligence</small></span>
        </Link>
        <nav aria-label="Primary navigation">
          {primaryLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
          <details className="more-menu">
            <summary>More</summary>
            <div>{moreLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}</div>
          </details>
        </nav>
      </div>
    </header>
  );
}
