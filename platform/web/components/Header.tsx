import Link from "next/link";

const primaryLinks = [
  ["Companies", "/companies"],
  ["Locations", "/locations"],
  ["Predicted Expansion", "/predicted-expansion"],
  ["Predicted Moves", "/predicted-moves"],
  ["Predicted Contraction", "/predicted-contraction"],
] as const;

const moreLinks = [
  { label: "Workspace", links: [["Saved", "/saved-searches"], ["Alerts", "/alerts"], ["Account", "/account"]] },
  { label: "Trust", links: [["Coverage", "/coverage"], ["Methodology", "/methodology"], ["Plans", "/pricing"]] },
  { label: "Intelligence", links: [["Government Business", "/search"], ["Industries", "/industries"], ["Agencies", "/agencies"]] },
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
          <details className="more-menu utility-menu">
            <summary>Workspace</summary>
            <div className="more-menu-panel">{moreLinks.map((group) => <section key={group.label}>
              <span>{group.label}</span>
              {group.links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
            </section>)}</div>
          </details>
          <Link className="nav-search" href="/companies" aria-label="Search companies"><span aria-hidden="true">⌕</span> Search</Link>
        </nav>
      </div>
    </header>
  );
}
