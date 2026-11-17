import Script from "next/script";
import Link from "next/link";
import { SupportComposeForm } from "@/components/SupportComposeForm";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Help & feedback",
  description: "Send a question, report a problem, or suggest an improvement to FirmQuarry.",
};

type SupportParams = { status?: string | string[] };

export default async function SupportPage({ searchParams }: { searchParams: Promise<SupportParams> }) {
  const raw = await searchParams;
  const status = Array.isArray(raw.status) ? raw.status[0] : raw.status;
  const supportAddress = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "support@firmquarry.com";
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const formReady = Boolean(
    siteKey &&
    process.env.TURNSTILE_SECRET_KEY?.trim() &&
    process.env.RESEND_API_KEY?.trim() &&
    process.env.RESEND_FROM_EMAIL?.trim() &&
    process.env.SUPPORT_INBOX_EMAIL?.trim(),
  );

  return (
    <section className="fq-support-page">
      {formReady ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" /> : null}
      <div className="fq-support-header">
        <p className="fq-section-eyebrow">FIRMQUARRY / SUPPORT</p>
        <h1>We’re here to help you uncover more.</h1>
        <p>Questions, bugs, feedback, or a data correction? Send us the details and we’ll take a look.</p>
      </div>
      {status === "sent" ? <div className="fq-support-status" role="status">Your message was received. Thanks for helping improve FirmQuarry.</div> : null}
      {status === "error" ? <div className="fq-support-status fq-support-status-error" role="alert">We couldn’t send your message. Please try again or email us directly.</div> : null}
      <div className="fq-support-content">
        <SupportComposeForm formReady={formReady} siteKey={siteKey} supportAddress={supportAddress} />
        <aside className="fq-support-right" aria-label="Support information">
          <div className="fq-support-side-card">
            <span className="fq-support-side-tag">DIRECT LINE</span>
            <h2>Prefer email?</h2>
            <p>Write directly to our support inbox. We read messages from real users building real workflows.</p>
            <a href={`mailto:${supportAddress}`} className="fq-support-mail">{supportAddress} <span aria-hidden="true">↗</span></a>
          </div>
          <div className="fq-support-side-card fq-support-side-muted">
            <span className="fq-support-side-tag">HELPFUL TO INCLUDE</span>
            <ul>
              <li>Which company or page you were looking at</li>
              <li>What you expected to see</li>
              <li>What happened instead</li>
            </ul>
          </div>
          <Link className="fq-support-methodology" href="/methodology">See how our data works <span aria-hidden="true">→</span></Link>
        </aside>
      </div>
    </section>
  );
}
