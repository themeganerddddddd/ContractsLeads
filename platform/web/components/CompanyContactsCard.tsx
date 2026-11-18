import "server-only";
import Link from "next/link";
import directory from "@/data/official-business-contacts.json";

type OfficialContact = {
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string;
  source_name: string;
  source_url: string;
  checked_date: string | null;
};

export function CompanyContactsCard({
  uei, website, companyName,
}: { uei?: string | null; website?: string | null; companyName: string }) {
  const key = (uei || "").trim().toUpperCase();
  // Never infer contacts by partial company names, parent companies, or common surnames.
  const record = key && /^[A-Z0-9]{12}$/.test(key)
    ? (directory.byUei as Record<string, OfficialContact>)[key] : undefined;
  const published = record && /^https:\/\/(?:www\.)?(?:sam\.gov|gsaelibrary\.gsa\.gov)\//i.test(record.source_url) ? record : undefined;
  const websiteLink = website && /^https:\/\//i.test(website) ? website : null;
  const checkedAt = published?.checked_date && /^\d{4}-\d{2}-\d{2}$/.test(published.checked_date)
    ? published.checked_date : null;

  return (
    <section id="company-contacts" className="fq-company-contacts" aria-label="Company contact information">
      <header>
        <div><span className="eyebrow">CONTACTS / OUTREACH</span><h2>Company contacts</h2></div>
        <span className="fq-contact-source-chip">Public professional records</span>
      </header>
      {published ? (
        <div className="fq-contact-item">
          <div className="fq-contact-avatar" aria-hidden="true">{published.name.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}</div>
          <div className="fq-contact-info">
            <h3>{published.name}</h3>
            <p>{published.title || (published.contact_type === "governmentbusinesspoc" ? "Government business point of contact" : "Published procurement contact")}</p>
            <span className="fq-contact-type">Official procurement contact · not necessarily expansion or real estate decision-maker</span>
            <div className="fq-contact-actions">
              {published.email ? <a href={`mailto:${published.email}`}>✉ {published.email}</a> : null}
              {published.phone ? <a href={`tel:${published.phone.replace(/[^+0-9]/g,"")}`}>☎ {published.phone}</a> : null}
              <a target="_blank" rel="noopener noreferrer" href={published.source_url}>Verify official record ↗</a>
            </div>
            <small className="fq-contact-foot">Source: {published.source_name}{checkedAt ? ` · Last checked ${checkedAt}` : ""}. Availability and accuracy may change.</small>
          </div>
        </div>
      ) : <p className="fq-contact-empty">No independently matched, source-backed professional contact is available for {companyName}. We do not invent people, phone numbers, or email addresses.</p>}
      {websiteLink ? <p className="fq-contact-company-website">Company website: <a href={websiteLink} target="_blank" rel="noopener noreferrer">Visit official website ↗</a></p> : null}
      <p className="fq-contact-disclosure">Only public professional directory records matched to the company’s exact UEI appear here. Separately licensed PitchBook contacts are not republished. <Link href="/methodology">Source methodology ↗</Link></p>
    </section>
  );
}
