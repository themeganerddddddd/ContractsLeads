import Link from "next/link";

export function Footer() {
  const contactEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@firmquarry.com";
  return (
    <footer className="site-footer bc-footer">
      <div className="bc-footer-statement">
        <div className="footer-brand"><span className="brand-mark" aria-hidden="true">FQ</span><strong>FirmQuarry</strong></div>
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
        <Link href="/support">Help &amp; feedback</Link>
        {contactEmail ? <a href={`mailto:${contactEmail}`}>Contact</a> : null}
      </nav>
    </footer>
  );
}
