import Link from "next/link";

const primaryLinks = [
  ["Radar", "/business-change"],
  ["Companies", "/companies"],
  ["Markets", "/locations"],
  ["Tracking", "/tracked-companies"],
  ["Alerts", "/alerts"],
] as const;

const moreLinks = [
  { label: "Intelligence", links: [["Government Business", "/search"], ["Industries", "/industries"], ["Agencies", "/agencies"]] },
  { label: "Workspace", links: [["Saved searches", "/saved-searches"], ["Plans", "/pricing"]] },
  { label: "Product", links: [["Data Coverage", "/data-coverage"], ["Methodology", "/methodology"]] },
] as const;

export function Header() {
  return (
    <header className="site-header">
      <div className="nav-shell">
        <Link className="brand" href="/" aria-label="BusinessCurrent home">
          <span className="brand-mark" aria-hidden="true">BC</span>
          <span><strong>BusinessCurrent</strong><small>Business change intelligence, nationwide.</small></span>
        </Link>
        <nav aria-label="Primary navigation">
          {primaryLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
          <details className="more-menu">
            <summary>More</summary>
            <div className="more-menu-panel">{moreLinks.map((group) => <section key={group.label}>
              <span>{group.label}</span>
              {group.links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
            </section>)}</div>
          </details>
          <Link className="nav-search" href="/companies" aria-label="Search companies, places, and industries"><span aria-hidden="true">⌕</span> Search</Link>
        </nav>
      </div>
    </header>
  );
}
