import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="fq-public-header">
      <div className="fq-public-header-inner">
        <Link className="fq-public-logo" href="/" aria-label="FirmQuarry home">
          <span className="fq-public-mark" aria-hidden="true"><i/><i/><i/><i/></span>
          <span>FirmQuarry<small>COMPANY INTELLIGENCE</small></span>
        </Link>
        <nav className="fq-public-navigation" aria-label="Public navigation">
          <Link href="/#how-it-works">How it works</Link>
          <Link href="/pricing">Plans &amp; pricing</Link>
          <Link href="/sign-in">Sign in</Link>
          <Link className="fq-public-workspace-link" href="/workspace">Open workspace <span aria-hidden="true">↗</span></Link>
        </nav>
      </div>
    </header>
  );
}
