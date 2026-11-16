import Link from "next/link";
import { PredictionScreener } from "@/components/PredictionScreener";

type RawParams = Record<string,string|string[]|undefined>;
export const dynamic = "force-dynamic";

export default function HomePage({searchParams}:{searchParams:Promise<RawParams>}) {
  return <>
    <section className="bc-home-intro">
      <div className="bc-home-intro-main">
        <p className="bc-home-kicker"><span className="bc-kicker-mark"/> BUSINESSCURRENT <span className="bc-home-kicker-divider">/</span> INTELLIGENCE WORKSPACE</p>
        <h1>Know which companies <span>are changing.</span></h1>
        <p>Prioritize opportunities and risks with evidence-backed expansion, movement and retention research. Start with the United States, then narrow to a state or county.</p>
      </div>
      <div className="bc-home-context">
        <span className="bc-home-context-label">WORKSPACE SCOPE</span>
        <strong>United States</strong>
        <span>Nationwide research · county-level filters</span>
        <Link href="/coverage">View coverage notes ↗</Link>
      </div>
    </section>
    <PredictionScreener kind="expansion" searchParams={searchParams} dashboard />
    <div className="bc-home-quicklinks">
      <div><span className="bc-kicker-mark"/><strong>Continue your research</strong><span className="bc-home-quicklinks-description">Search source data or review the methodology behind each signal.</span></div>
      <nav aria-label="Other research tools">
        <Link href="/companies">Company profiles <span aria-hidden="true">↗</span></Link>
        <Link href="/contracts">GOVERNMENT CONTRACT HISTORY <span aria-hidden="true">↗</span></Link>
        <Link href="/methodology">Methodology <span aria-hidden="true">↗</span></Link>
      </nav>
    </div>
  </>;
}
