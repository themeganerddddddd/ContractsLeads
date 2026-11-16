import Link from "next/link";
import { PredictionScreener } from "@/components/PredictionScreener";

type RawParams = Record<string,string|string[]|undefined>;
export const dynamic = "force-dynamic";

export default function HomePage({searchParams}:{searchParams:Promise<RawParams>}) {
  return <>
    <section className="bc-home-intro">
      <div className="bc-home-intro-main">
        <p className="bc-home-kicker"><span className="bc-kicker-mark"/> COMPANY CHANGE INTELLIGENCE</p>
        <h1>Company change, ranked by evidence.</h1>
        <p>Screen expansion, movement, and retention signals across the United States. Every assessment stays connected to its source record and coverage limits.</p>
      </div>
      <div className="bc-home-context">
        <span className="bc-home-context-label">DEFAULT MARKET</span>
        <strong>United States</strong><span>State and county filters available</span>
        <Link href="/coverage">Review coverage</Link>
      </div>
    </section>
    <PredictionScreener kind="expansion" searchParams={searchParams} dashboard />
    <div className="bc-home-quicklinks">
      <div><span className="bc-kicker-mark"/><strong>Source-backed research</strong><span className="bc-home-quicklinks-description">Go deeper without losing the workspace context.</span></div>
      <nav aria-label="Other research tools">
        <Link href="/companies">Company directory</Link>
        <Link href="/contracts">Government contracts</Link>
        <Link href="/methodology">Methodology</Link>
      </nav>
    </div>
  </>;
}
