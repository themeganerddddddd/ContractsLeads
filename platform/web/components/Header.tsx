import Link from "next/link";

const links = [
  ["Search", "/search"], ["Companies", "/companies"], ["Contracts", "/contracts"],
  ["Locations", "/locations"], ["Industries", "/industries"], ["Agencies", "/agencies"], ["Pricing", "/pricing"]
] as const;

export function Header() {
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Link className="brand" href="/" aria-label="Federal Ledger home">
          <span className="brand-mark" aria-hidden="true">FL</span>
          <span><strong>Federal Ledger</strong><small>Contract intelligence</small></span>
        </Link>
        <nav aria-label="Primary navigation">
          {links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        </nav>
        <Link className="account-link" href="/saved-searches">Saved searches</Link>
      </div>
    </header>
  );
}
