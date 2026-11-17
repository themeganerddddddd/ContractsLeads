import Link from "next/link";
import { ProviderSignInButton } from "@/components/ProviderSignInButton";
import { authProviderAvailability } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Find the signal behind the next business move",
  description: "FirmQuarry organizes source-backed company changes, government contracts, and geographic intelligence into one research workspace.",
};

const capabilities = [
  { number: "01", name: "Discover", title: "Find the right companies.", text: "Search across company and location records. Build a more complete picture of an organization without jumping between disconnected public sources.", href: "/companies", cta: "Explore companies" },
  { number: "02", name: "Understand", title: "Read the signals, not just the headlines.", text: "See source-supported indicators of expansion, movement, contraction, and other changes—with evidence links and clear coverage limitations.", href: "/predicted-expansion", cta: "Explore intelligence" },
  { number: "03", name: "Act", title: "Take your research further.", text: "Review government-contract activity, track businesses, and carry promising opportunities into saved research and alerts when your plan permits.", href: "/contracts", cta: "Explore contracts" },
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
            <div className="fq-hero-eyebrow"><span aria-hidden="true" className="fq-hero-pulse" /> COMPANY INTELLIGENCE, RECONSTRUCTED</div>
            <h1 id="fq-hero-title">Every company is moving.<br/><em>Know what comes next.</em></h1>
            <p className="fq-hero-lead">Find businesses growing, relocating, contracting, and winning contracts. FirmQuarry turns scattered official records into a clearer picture of opportunity.</p>
            <div className="fq-hero-cta-row">
              <Link href="/workspace" className="fq-button fq-button-primary">Explore the workspace <span aria-hidden="true">↗</span></Link>
              <Link href="/pricing" className="fq-button fq-button-outline">Explore plans &amp; pricing <span aria-hidden="true">→</span></Link>
            </div>
            <div className="fq-hero-reassurance">
              <span>✓ Source-linked records</span>
              <span>✓ Transparent confidence</span>
              <span>✓ Free research access</span>
            </div>
          </div>
          <aside className="fq-hero-signin" id="sign-in" aria-labelledby="fq-signin-title">
            <div className="fq-signin-heading">
              <span className="fq-signin-symbol" aria-hidden="true">FQ</span>
              <span className="fq-signin-pretitle">YOUR RESEARCH ACCOUNT</span>
            </div>
            <h2 id="fq-signin-title">Your next discovery starts here.</h2>
            <p>Sign in to return to your research, track companies, and manage your plan.</p>
            <div className="fq-signin-options">
              {providers.google ? <ProviderSignInButton provider="google" callbackUrl="/workspace" /> : null}
              {providers.github ? <ProviderSignInButton provider="github" callbackUrl="/workspace" /> : null}
              {!signInAvailable ? (
                <div className="fq-signin-pending">Account sign-in is being prepared. You can explore public company research right now without an account.</div>
              ) : null}
            </div>
            <Link className="fq-signin-guest" href="/companies">Continue without signing in <span aria-hidden="true">↗</span></Link>
            <div className="fq-signin-foot">New to FirmQuarry? <Link href="/pricing">See the free and paid plans</Link>.</div>
          </aside>
        </div>
        <div className="fq-hero-index" aria-hidden="true"><span>COMPANY RESEARCH</span><span>PUBLIC RECORDS</span><span>BUSINESS CHANGE</span><span>GEOGRAPHIC INTELLIGENCE</span></div>
      </section>

      <section className="fq-value-section" id="how-it-works">
        <div className="fq-section-wrap">
          <div className="fq-section-intro">
            <div><p className="fq-section-eyebrow">THE WORKSPACE</p><h2>A sharper lens on business activity.</h2></div>
            <p>Go from fragmented information to an evidence-backed company picture. Start broad, follow the signal, and verify the source.</p>
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
            <div><span className="fq-section-eyebrow">BUILT AROUND THE EVIDENCE</span><h3>Strong claims need strong sources.</h3><p>FirmQuarry distinguishes observed events from signals and model-based outlooks. Estimates and destination claims only appear where the evidence supports them.</p></div>
            <Link href="/methodology">Read the methodology <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>

      <section className="fq-plan-section">
        <div className="fq-section-wrap fq-plan-wrap">
          <div><p className="fq-section-eyebrow">SIMPLE, TRANSPARENT PLANS</p><h2>Begin with the signal.<br/>Go deeper when you need to.</h2><p>Explore company intelligence for free, then upgrade for deeper research, saved work, and tracking. Paid checkout is available only once account and billing services are enabled.</p></div>
          <div className="fq-plan-summary">
            <div className="fq-plan-row"><span>Free</span><strong>$0</strong><small>Start exploring</small></div>
            <div className="fq-plan-row"><span>Starter</span><strong>$15<small>/mo</small></strong><small>Saved research &amp; weekly alerts</small></div>
            <div className="fq-plan-row"><span>Pro</span><strong>$39<small>/mo</small></strong><small>Advanced screening &amp; tracking</small></div>
            <Link href="/pricing" className="fq-button fq-button-primary">Compare every plan <span aria-hidden="true">↗</span></Link>
            <small className="fq-plan-note">Analyst plan also available · $99/month</small>
          </div>
        </div>
      </section>
    </div>
  );
}
