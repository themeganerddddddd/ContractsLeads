"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const primaryLinks = [
  ["Overview", "/workspace"],
  ["Expansion Intelligence", "/predicted-expansion"],
  ["Movement Intelligence", "/predicted-moves"],
  ["Retention Intelligence", "/predicted-contraction"],
  ["Companies", "/companies"],
  ["New Deals", "/deals"],
  ["Attraction", "/attraction"],
  ["My Portfolio", "/tracked-companies"],
  ["Locations", "/locations"],
  ["Government Contracts", "/contracts"],
] as const;

const moreLinks = [
  { label: "Research", links: [["Government Business", "/search"], ["Industries", "/industries"], ["Agencies", "/agencies"], ["Business changes", "/business-change"], ["Public source archive", "/public-records"]] },
  { label: "Workspace", links: [["Saved", "/saved-searches"], ["Alerts", "/alerts"], ["Coverage", "/coverage"]] },
  { label: "About the data", links: [["Methodology", "/methodology"]] },
] as const;

const relatedRoutes: Record<string, string[]> = {
  "/companies": ["/company", "/establishment"],
  "/contracts": ["/contract"],
};

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  const isCurrent = (route: string) => {
    if (route === "/") return pathname === "/";
    if (pathname === route || pathname.startsWith(`${route}/`)) return true;
    return (relatedRoutes[route] || []).some(prefix => pathname.startsWith(`${prefix}/`));
  };

  const navigation = (mobile = false) => (
    <nav className={mobile ? "bc-mobile-nav" : "bc-primary-nav"} aria-label={mobile ? "Mobile navigation" : "Primary navigation"}>
      {primaryLinks.map(([label, href]) => (
        <Link key={href} href={href} className={isCurrent(href) ? "is-current" : ""} aria-current={isCurrent(href) ? "page" : undefined}>
          {label}
        </Link>
      ))}
      <details className="bc-more">
        <summary>More</summary>
        <div className="bc-more-panel">
          {moreLinks.map(group => (
            <section key={group.label}>
              <span>{group.label}</span>
              {group.links.map(([label, href]) => <Link href={href} key={href}>{label}</Link>)}
            </section>
          ))}
        </div>
      </details>
      <div className="fq-sidebar-account">
        <span className="fq-sidebar-account-label">YOUR WORKSPACE</span>
        <Link href="/account" className={isCurrent("/account") ? "fq-sidebar-selected" : ""} aria-current={isCurrent("/account") ? "page" : undefined}>My Account</Link>
        <Link href="/support" className={isCurrent("/support") ? "fq-sidebar-selected" : ""} aria-current={isCurrent("/support") ? "page" : undefined}>Help &amp; Feedback</Link>
      </div>
    </nav>
  );

  return (
    <header className="bc-global-header">
      <div className="bc-global-bar">
        <Link href="/" className="bc-brand" aria-label="FirmQuarry home">
          <span className="bc-brand-symbol" aria-hidden="true"><span/><span/><span/><span/></span>
          <span className="bc-brand-type"><strong>FirmQuarry</strong><small>COMPANY INTELLIGENCE</small></span>
        </Link>

        <form className="bc-global-search" action="/companies" method="get" role="search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>
          <input type="search" name="q" aria-label="Search companies" placeholder="Search a company or legal name" autoComplete="off" />
          <button type="submit">Search</button>
        </form>

        <div className="bc-global-actions">
          <Link href="/coverage"><span className="bc-live-dot" aria-hidden="true"/>Coverage</Link>
          <Link href="/account" className="bc-account-link" aria-label="Account and settings"><span aria-hidden="true">FQ</span><b>Account</b></Link>
          <button className="bc-menu-button" type="button" aria-expanded={menuOpen} aria-controls="bc-mobile-menu" onClick={() => setMenuOpen(value => !value)}>
            <span aria-hidden="true"/><span aria-hidden="true"/><span aria-hidden="true"/><b>{menuOpen ? "Close" : "Menu"}</b>
          </button>
        </div>
      </div>
      <div className="bc-primary-strip">{navigation()}</div>
      <div id="bc-mobile-menu" className={`bc-mobile-panel${menuOpen ? " is-open" : ""}`} hidden={!menuOpen}>{navigation(true)}</div>
    </header>
  );
}
