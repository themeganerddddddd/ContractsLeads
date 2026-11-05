import Link from "next/link";

export function Footer() {
  const contactEmail = process.env.NEXT_PUBLIC_SALES_EMAIL?.trim();
  return (
    <footer className="site-footer">
      <div>
        <div className="footer-brand"><span className="brand-mark" aria-hidden="true">BC</span><strong>BusinessCurrent</strong></div>
        <p>Company intelligence built around change. Every signal stays tied to its evidence and coverage limits.</p>
      </div>
      <div className="footer-links">
        <Link href="/companies">Companies</Link>
        <Link href="/locations">Locations</Link>
        <Link href="/pricing">Plans</Link>
        <Link href="/account">Account</Link>
        <Link href="/coverage">Coverage</Link>
        <Link href="/methodology">Methodology</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
        {contactEmail ? <a href={`mailto:${contactEmail}`}>Contact</a> : null}
      </div>
    </footer>
  );
}
