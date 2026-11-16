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
  { label: "Research", links: [["Government Business", "/search"],["Industries","/industries"],["Agencies","/agencies"],["Business changes","/business-change"],["Public source archive","/public-records"]] },
  { label: "Workspace", links: [["Saved","/saved-searches"],["Alerts","/alerts"],["Account","/account"]] },
  { label: "About", links: [["Coverage","/coverage"],["Methodology","/methodology"],["Plans","/pricing"]] },
] as const;

export function Header(){
  return <header className="site-header studio-header terminal-site-header">
    <div className="nav-shell terminal-nav-shell">
      <Link className="brand terminal-brand" href="/" aria-label="BusinessCurrent home">
        <span className="terminal-wordmark" aria-hidden="true"><i/><i/><i/></span>
        <span className="terminal-brand-word"><strong>businesscurrent<span>.</span></strong><small>COMPANY INTELLIGENCE</small></span>
      </Link>
      <nav className="studio-nav terminal-nav" aria-label="Primary navigation">
        {primaryLinks.map(([label,href])=><Link key={href} href={href} className={href==="/locations"?"terminal-nav-secondary":""}>{label}</Link>)}
        <details className="more-menu utility-menu terminal-more">
          <summary>More</summary>
          <div className="more-menu-panel terminal-more-panel">
            {moreLinks.map(group=><section key={group.label}>
              <span>{group.label}</span>
              {group.links.map(([label,href])=><Link href={href} key={href}>{label}</Link>)}
            </section>)}
          </div>
        </details>
      </nav>
      <Link className="terminal-workspace-link" href="/saved-searches">Workspace <span aria-hidden="true">↗</span></Link>
    </div>
  </header>;
}
