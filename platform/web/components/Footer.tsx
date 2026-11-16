import Link from "next/link";

export function Footer() {
  const contactEmail = process.env.NEXT_PUBLIC_SALES_EMAIL?.trim();
  return (
    <footer className="site-footer bc-footer">
      <div className="bc-footer-statement">
        <div className="footer-brand"><span className="brand-mark" aria-hidden="true">BC</span><strong>BusinessCurrent</strong></div>
        <p>Company change intelligence grounded in traceable evidence.</p>
      </div>
      <nav className="footer-links" aria-label="Footer navigation">
        <Link href="/companies">Companies</Link>
        <Link href="/locations">Locations</Link>
        <Link href="/pricing">Plans</Link>
        <Link href="/account">Account</Link>
        <Link href="/coverage">Coverage</Link>
        <Link href="/public-records">Source archive</Link>
        <Link href="/methodology">Methodology</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        {contactEmail ? <a href={`mailto:${contactEmail}`}>Contact</a> : null}
      </nav>
    </footer>
  );
}
