import Link from "next/link";

const primaryLinks = [
  ["Companies", "/companies"],
  ["Expansion Radar", "/predicted-expansion"],
  ["Movement Radar", "/predicted-moves"],
  ["Retention Radar", "/predicted-contraction"],
  ["Government Contracts", "/contracts"],
  ["Locations", "/locations"],
] as const;

const moreLinks = [
  { label: "Your workspace", links: [["Saved", "/saved-searches"], ["Alerts", "/alerts"], ["Account", "/account"]] },
  { label: "Explore", links: [["Public source archive", "/public-records"], ["Government Business", "/search"], ["Industries", "/industries"], ["Agencies", "/agencies"], ["Business changes", "/business-change"]] },
  { label: "About the data", links: [["Coverage", "/coverage"], ["Methodology", "/methodology"], ["Plans", "/pricing"]] },
] as const;

export function Header() {
  return <header className="site-header studio-header">
    <div className="nav-shell">
      <Link className="brand" href="/" aria-label="BusinessCurrent home">
        <span className="brand-mark studio-brand-mark" aria-hidden="true"><span /><span /><span /><span /></span>
        <span><strong>businesscurrent<span className="studio-brand-period">.</span></strong><small>Company intelligence</small></span>
      </Link>
      <nav aria-label="Primary navigation" className="studio-nav">
        {primaryLinks.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
        <details className="more-menu utility-menu">
          <summary>More <span aria-hidden="true">⌄</span></summary>
          <div className="more-menu-panel">{moreLinks.map(group => <section key={group.label}>
            <span>{group.label}</span>
            {group.links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
          </section>)}</div>
        </details>
        <Link className="studio-nav-cta" href="/companies" aria-label="Search companies">Explore <span aria-hidden="true">↗</span></Link>
      </nav>
    </div>
  </header>;
}
