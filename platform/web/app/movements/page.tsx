import { CoveragePanel } from "@/components/CoveragePanel";
import { DatabaseNotice } from "@/components/DatabaseNotice";
import { MetricCard } from "@/components/MetricCard";
import { MovementSearchForm } from "@/components/MovementSearchForm";
import { MovementTable } from "@/components/MovementTable";
import { Pagination } from "@/components/Pagination";
import {
  parseMovementInput,
  searchMovements,
  type RawMovementParams,
} from "@/lib/movements";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Company movements",
  description: "Source-backed layoffs, closures, expansions, facilities, headquarters, jobs, and investments from official public sources.",
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<RawMovementParams>;
}) {
  const raw = await searchParams;
  const input = parseMovementInput(raw);
  try {
    const result = await searchMovements(input);
    const metrics = result.metrics || {};
    return (
      <>
        <section className="page-heading">
          <p className="eyebrow">Company movement intelligence</p>
          <h1>Company movements</h1>
          <p>
            Search source-backed workforce reductions, closures, expansions, facilities, headquarters moves, announced jobs, and investments without treating announcement claims as completed outcomes.
          </p>
        </section>
        <div className="metrics-grid">
          <MetricCard label="Observed events" value={Number(metrics.events || 0).toLocaleString()} note="covered official sources" />
          <MetricCard label="Growth signals" value={Number(metrics.growth_events || 0).toLocaleString()} note="announcements, not outcomes" />
          <MetricCard label="Contraction signals" value={Number(metrics.contraction_events || 0).toLocaleString()} note="published dislocations" />
          <MetricCard label="Jobs reported" value={(Number(metrics.announced_jobs || 0) + Number(metrics.affected_jobs || 0)).toLocaleString()} note="new + affected; not netted" />
        </div>
        <MovementSearchForm input={input} sources={result.sources} industries={result.industries} sourceTypes={result.sourceTypes} />
        <div className="results-toolbar">
          <div>
            <h2>{result.total.toLocaleString()} matching events</h2>
            <p>Every row links to its official evidence. Company links may be marked pending review.</p>
          </div>
          <a href="#coverage">View coverage limitations ↓</a>
        </div>
        <MovementTable rows={result.rows} />
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          params={raw}
          basePath="/movements"
        />
        <CoveragePanel coverage={result.coverage} />
      </>
    );
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return (
      <>
        <section className="page-heading">
          <p className="eyebrow">Company movement intelligence</p>
          <h1>Company movements</h1>
        </section>
        <DatabaseNotice message={message} />
      </>
    );
  }
}
