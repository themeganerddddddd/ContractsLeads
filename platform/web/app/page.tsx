import Link from "next/link";
import { PredictionScreener } from "@/components/PredictionScreener";

type RawParams=Record<string,string|string[]|undefined>;
export const dynamic="force-dynamic";

export default async function HomePage({searchParams}:{searchParams:Promise<RawParams>}){
  return <>
    <PredictionScreener kind="expansion" searchParams={searchParams}/>
    <section className="terminal-source-bar">
      <div><span className="terminal-greenline"/><strong>Built for decisions, not dashboards.</strong>
        <p>Review source-linked company changes, retain geographic context, and distinguish real evidence from calibrated forecasts.</p>
      </div>
      <nav aria-label="Explore source data">
        <Link href="/companies">Companies ↗</Link>
        <Link href="/contracts">GOVERNMENT CONTRACT HISTORY ↗</Link>
        <Link href="/public-records">Source library ↗</Link>
      </nav>
    </section>
  </>;
}
