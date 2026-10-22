import Link from "next/link";

export function Footer() {
  return (
    <footer className="site-footer">
      <div>
        <strong>Federal Ledger</strong>
        <p>Government procurement intelligence derived from official U.S., UK, and EU sources. Disclosed values are not economic-impact estimates.</p>
      </div>
      <div className="footer-links">
        <Link href="/pricing">Plans</Link>
        <a href="https://www.usaspending.gov/" rel="noreferrer" target="_blank">USAspending.gov ↗</a>
        <a href="https://www.find-tender.service.gov.uk/" rel="noreferrer" target="_blank">Find a Tender ↗</a>
        <a href="https://ted.europa.eu/" rel="noreferrer" target="_blank">TED ↗</a>
      </div>
    </footer>
  );
}
