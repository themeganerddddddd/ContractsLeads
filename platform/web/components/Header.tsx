"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primaryLinks = [
  ["Companies", "/companies"],
  ["Expansion Radar", "/predicted-expansion"],
  ["Movement Radar", "/predicted-moves"],
  ["Retention Radar", "/predicted-contraction"],
  ["Government Contracts", "/contracts"],
  ["Locations", "/locations"],
] as const;

const moreLinks = [
  { label: "Research tools", links: [["Government Business", "/search"], ["Industries", "/industries"], ["Agencies", "/agencies"], ["Business changes", "/business-change"], ["Public source archive", "/public-records"]] },
  { label: "My workspace", links: [["Saved", "/saved-searches"], ["Alerts", "/alerts"], ["Account", "/account"]] },
  { label: "Resources", links: [["Coverage", "/coverage"], ["Methodology", "/methodology"], ["Plans", "/pricing"]] },
] as const;

const paths = {
  dashboard: "/",
} as const;

function NavGlyph({ name }: { name: string }) {
  // Self-contained thin-line symbols, no icon package or additional client requests.
  const paths: Record<string, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    expansion: <><path d="M4 18l6-6 4 3 6-9"/><path d="M15 6h5v5"/></>,
    movement: <><path d="M3 8h17m0 0-4-4m4 4-4 4"/><path d="M21 16H4m0 0 4-4m-4 4 4 4"/></>,
    retention: <><path d="M12 21s8-4 8-10V5l-8-3-8 3v6c0 6 8 10 8 10Z"/><path d="m9 11 2 2 4-4"/></>,
    companies: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2m2 0h2M9 11h2m2 0h2M9 15h2m2 0h2M10 21v-3h4v3"/></>,
    locations: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    contracts: <><path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M15 3v5h4M9 12h7m-7 4h7"/></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function Header() {
  const pathname = usePathname();
  const here = (route: string) => pathname === route || (route !== "/" && pathname.startsWith(route + "/"));
  const link = (label: string, href: string, glyph: string) => (
    <Link key={href} href={href} className={`bc-side-link${here(href) ? " bc-side-link-active" : ""}`} aria-current={here(href) ? "page" : undefined}>
      <NavGlyph name={glyph}/><span>{label}</span>{here(href) ? <i aria-hidden="true" className="bc-side-current"/> : null}
    </Link>
  );
  return <header className="site-header studio-header terminal-site-header bc-sidebar">
    <div className="bc-sidebar-brand">
      <Link href="/" className="bc-brand" aria-label="BusinessCurrent home">
        <span className="bc-brand-symbol" aria-hidden="true"><span/><span/><span/><span/></span>
        <span className="bc-brand-type"><strong>BusinessCurrent</strong><small>INTELLIGENCE PLATFORM</small></span>
      </Link>
      <span className="bc-brand-version">RESEARCH WORKSPACE</span>
    </div>
    <nav className="bc-sidebar-nav" aria-label="Primary navigation">
      <div className="bc-sidebar-group">
        <span className="bc-nav-group-title">Workspace</span>
        {link("Overview", paths.dashboard, "dashboard")}
      </div>
      <div className="bc-sidebar-group">
        <span className="bc-nav-group-title">Intelligence</span>
        {link(primaryLinks[1][0], primaryLinks[1][1], "expansion")}
        {link(primaryLinks[2][0], primaryLinks[2][1], "movement")}
        {link(primaryLinks[3][0], primaryLinks[3][1], "retention")}
      </div>
      <div className="bc-sidebar-group">
        <span className="bc-nav-group-title">Discover</span>
        {link(primaryLinks[0][0], primaryLinks[0][1], "companies")}
        {link(primaryLinks[5][0], primaryLinks[5][1], "locations")}
        {link(primaryLinks[4][0], primaryLinks[4][1], "contracts")}
      </div>
      <div className="bc-sidebar-group bc-sidebar-group-more">
        <details className="more-menu utility-menu terminal-more bc-more">
          <summary>More</summary>
          <div className="more-menu-panel terminal-more-panel bc-more-panel">
            {moreLinks.map(group => <section key={group.label}>
              <span>{group.label}</span>
              {group.links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
            </section>)}
          </div>
        </details>
      </div>
    </nav>
    <div className="bc-sidebar-footer">
      <Link href="/saved-searches" className="bc-sidebar-footer-link">Saved searches <span aria-hidden="true">↗</span></Link>
      <Link href="/methodology" className="bc-sidebar-footer-link">Methodology <span aria-hidden="true">↗</span></Link>
      <div className="bc-sidebar-signoff"><span className="bc-brand-mini"/> Intelligence you can verify.</div>
    </div>
  </header>;
}
