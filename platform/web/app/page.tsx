import Link from "next/link";
import { ProviderSignInButton } from "@/components/ProviderSignInButton";
import { authProviderAvailability } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Know when companies are likely to expand, contract, or move",
  description: "Unearth source-backed indicators of company expansion, contraction, and relocation. FirmQuarry helps you investigate which businesses may move next—and why.",
};

const capabilities = [
  {
    number: "01",
    name: "Expansion",
    title: "Spot who could grow next.",
    text: "Dig into the evidence behind potential company expansions—from new business activity to contracts and other documented signals. Find candidates worth investigating.",
    href: "/predicted-expansion",
    cta: "Explore expansion intelligence",
  },
  {
    number: "02",
    name: "Contraction",
    title: "Find the warning signs early.",
    text: "Look beneath the surface for source-backed indicators of companies potentially shrinking or pulling back. Separate documented changes from forward-looking assessments.",
    href: "/predicted-contraction",
    cta: "Explore contraction intelligence",
  },
  {
    number: "03",
    name: "Relocation",
    title: "Know who might be on the move.",
    text: "Unearth clues that a company could relocate or shift operations. Explore the supporting records—and treat destinations as known only when the evidence warrants it.",
    href: "/predicted-moves",
    cta: "Explore movement intelligence",
  },
] as const;

export default function LandingPage() {
  const providers = authProviderAvailability();
  const signInAvailable = providers.google || providers.github;

  return (
    <div className="fq-landing">
      <section className="fq-hero" aria-labelledby="fq-hero-title">
        <div className="fq-hero-orbit" aria-hidden="true" />
        <div className="fq-hero-inner">
          <div className="fq-hero-copy">
            <div className="fq-hero-eyebrow"><span aria-hidden="true" className="fq-hero-pulse" /> UNEARTH THE SIGNALS. ANTICIPATE THE SHIFT.</div>
            <h1 id="fq-hero-title">Unearth their next move.<br/><em>Before it happens.</em></h1>
            <p className="fq-hero-lead"><strong>Know when a company is likely to expand, contract, or move.</strong> FirmQuarry digs through scattered public records to surface evidence-backed business signals—so you can investigate what may happen next, not just what already happened.</p>
            <div className="fq-hero-cta-row">
              <Link href="/workspace" className="fq-button fq-button-primary">Start for free <span aria-hidden="true">↗</span></Link>
              <Link href="/pricing" className="fq-button fq-button-outline">View pricing plans <span aria-hidden="true">→</span></Link>
            </div>
            <div className="fq-hero-reassurance">
              <span>✓ Expansion, contraction &amp; relocation</span>
              <span>✓ Evidence you can trace</span>
              <span>✓ Free public research</span>
            </div>
          </div>
          <aside className="fq-hero-signin" id="sign-in" aria-labelledby="fq-signin-title">
            <div className="fq-signin-heading">
              <span className="fq-signin-symbol" aria-hidden="true">FQ</span>
              <span className="fq-signin-pretitle">YOUR RESEARCH ACCOUNT</span>
            </div>
            <h2 id="fq-signin-title">Dig deeper into what comes next.</h2>
            <p>Keep the company signals you uncover close at hand. Sign in to return to saved research, track businesses, and manage your plan.</p>
            <div className="fq-signin-options">
              {providers.google ? <ProviderSignInButton provider="google" callbackUrl="/workspace" /> : null}
              {providers.github ? <ProviderSignInButton provider="github" callbackUrl="/workspace" /> : null}
              {!signInAvailable ? (
                <div className="fq-signin-pending">Account sign-in is being prepared. You can explore public company research right now without an account.</div>
              ) : null}
            </div>
            <Link className="fq-signin-guest" href="/companies">Continue without signing in <span aria-hidden="true">↗</span></Link>
            <div className="fq-signin-foot">New to FirmQuarry? <Link href="/pricing">View pricing plans</Link>.</div>
          </aside>
        </div>
        <div className="fq-hero-index" aria-hidden="true"><span>EXPANSION INTELLIGENCE</span><span>CONTRACTION SIGNALS</span><span>RELOCATION OUTLOOK</span><span>SOURCE-BACKED RESEARCH</span></div>
      </section>

      <section className="fq-value-section" id="how-it-works">
        <div className="fq-section-wrap">
          <div className="fq-section-intro">
            <div><p className="fq-section-eyebrow">DIG BENEATH THE SURFACE</p><h2>Three moves. One clearer picture.</h2></div>
            <p>Is a company likely to expand, contract, or move? Follow the clues beneath the headlines, compare the evidence, and see what deserves a closer look.</p>
          </div>
          <div className="fq-feature-grid">
            {capabilities.map(feature => (
              <article className="fq-feature" key={feature.number}>
                <div className="fq-feature-meta"><span>{feature.number}</span><span>{feature.name}</span></div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
                <Link href={feature.href}>{feature.cta} <span aria-hidden="true">↗</span></Link>
              </article>
            ))}
          </div>
          <div className="fq-data-philosophy">
            <div className="fq-philosophy-mark" aria-hidden="true"><span /><span /><span /></div>
            <div><span className="fq-section-eyebrow">THE PROOF IS IN THE STRATA</span><h3>Not every signal is a prediction.</h3><p>FirmQuarry separates verified changes from early indicators and model-based outlooks. The source is never buried: evidence and coverage limits stay visible, and predicted likelihoods appear only when supported by validated models.</p></div>
            <Link href="/methodology">Read the methodology <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>

      <section className="fq-plan-section">
        <div className="fq-section-wrap fq-plan-wrap">
          <div><p className="fq-section-eyebrow">START WITH A FREE DIG</p><h2>Start for free.<br/>Unearth what’s next.</h2><p>Explore which companies may expand, contract, or relocate—without paying to get started. When you need deeper research and monitoring, compare the available plans. Paid checkout is available once account and billing services are enabled.</p></div>
          <div className="fq-plan-summary fq-start-card">
            <span className="fq-start-card-overline">YOUR FIRST LOOK IS FREE</span>
            <h3>There’s more beneath the surface.</h3>
            <p>Start investigating expansion, contraction, and relocation signals with no subscription required for public research.</p>
            <Link href="/workspace" className="fq-button fq-button-primary">Start for free <span aria-hidden="true">↗</span></Link>
            <Link href="/pricing" className="fq-button fq-button-secondary">View pricing plans <span aria-hidden="true">→</span></Link>
            <small className="fq-plan-note">Free public exploration · Paid research plans available</small>
          </div>
        </div>
      </section>
    </div>
  );
}
