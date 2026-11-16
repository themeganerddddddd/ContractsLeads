import Link from "next/link";

export function WorkspaceTopbar(){
  return <div className="bc-topbar">
    <div className="bc-topbar-id"><span className="bc-topbar-dot" aria-hidden="true"/><span>Research workspace</span><span className="bc-topbar-divider">/</span><span className="bc-topbar-subtle">Business intelligence</span></div>
    <form className="bc-top-search" action="/companies" method="get" role="search">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><circle cx="10.7" cy="10.7" r="6.5"/><path d="m16 16 5 5"/></svg>
      <input type="search" name="q" aria-label="Search all companies" placeholder="Search companies, legal names..." autoComplete="off"/>
      <button type="submit">Search <span aria-hidden="true">↗</span></button>
    </form>
    <div className="bc-topbar-actions">
      <Link href="/coverage" className="bc-topbar-data-link" title="Review geographic and source coverage"><span className="bc-topbar-status-pip"/> Data coverage</Link>
      <Link href="/account" className="bc-account-link" aria-label="Account and settings"><span aria-hidden="true">◯</span><span>Account</span></Link>
    </div>
  </div>;
}
