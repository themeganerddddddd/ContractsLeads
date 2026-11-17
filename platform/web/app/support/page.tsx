import Script from "next/script";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Help & feedback",
  description: "Ask a question, report an error, or suggest an improvement to FirmQuarry.",
};

type SupportParams = { status?: string | string[] };

export default async function SupportPage({ searchParams }: { searchParams: Promise<SupportParams> }) {
  const raw = await searchParams;
  const status = Array.isArray(raw.status) ? raw.status[0] : raw.status;
  const supportAddress = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  const formReady = Boolean(
    siteKey &&
    process.env.TURNSTILE_SECRET_KEY?.trim() &&
    process.env.RESEND_API_KEY?.trim() &&
    process.env.RESEND_FROM_EMAIL?.trim() &&
    process.env.SUPPORT_INBOX_EMAIL?.trim(),
  );

  return (
    <section className="page-heading" style={{ maxWidth: 760, margin: "32px auto 56px" }}>
      <p className="eyebrow">FirmQuarry / Support</p>
      <h1>Help &amp; feedback</h1>
      <p>Spotted a data issue, need help with your account, or have an idea? Tell us what happened and include the relevant company or page when possible.</p>
      {status === "sent" ? <div className="account-card" role="status"><strong>Message received.</strong><p>Thanks for helping improve FirmQuarry. We will review your note.</p></div> : null}
      {status === "error" ? <div className="account-card" role="alert"><strong>Message could not be sent.</strong><p>Please try again or use the email address below.</p></div> : null}
      {formReady ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <form method="post" action="/api/support" className="account-card" style={{ display: "grid", gap: 14, marginTop: 24 }}>
            <label style={{ display: "grid", gap: 6 }}>What can we help with?
              <select name="category" required defaultValue="question">
                <option value="question">General question</option>
                <option value="bug">Bug or broken feature</option>
                <option value="data">Data correction</option>
                <option value="feature">Feature suggestion</option>
                <option value="billing">Account or billing</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>Your email
              <input type="email" name="email" autoComplete="email" maxLength={254} required placeholder="you@company.com" />
            </label>
            <label style={{ display: "grid", gap: 6 }}>Message
              <textarea name="message" rows={6} maxLength={4000} minLength={12} required placeholder="What happened? What would you like to see?" style={{ width: "100%", resize: "vertical", font: "inherit", padding: 12 }} />
            </label>
            <label aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}>
              Leave this blank <input type="text" name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <div className="cf-turnstile" data-sitekey={siteKey}></div>
            <button className="button primary" type="submit">Send feedback</button>
            <small>We use your email to respond to this request. Do not include passwords, payment-card information, or other sensitive data.</small>
          </form>
        </>
      ) : <div className="account-card" style={{ marginTop: 24 }}>
        <strong>Contact form is not enabled yet.</strong>
        <p>Direct email support will be available after the FirmQuarry inbox is configured.</p>
      </div>}
      {supportAddress ? <p style={{ marginTop: 22 }}>Prefer email? <a href={`mailto:${supportAddress}`}>{supportAddress}</a></p> : null}
    </section>
  );
}
