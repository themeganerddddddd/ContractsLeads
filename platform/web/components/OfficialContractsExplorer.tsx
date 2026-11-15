import Link from "next/link";
import { compactMoney, dateLabel } from "@/lib/format";
import { searchPublicFederalAwards } from "@/lib/public-federal-awards";

type RawParams = Record<string, string | string[] | undefined>;
type Props = { searchParams?: RawParams; compact?: boolean };
function scalar(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

/** Uses official U.S. source records only. Never presents them as internal company intelligence. */
export async function OfficialContractsExplorer({ searchParams = {}, compact = false }: Props) {
  const recipient = scalar(searchParams.recipient || searchParams.q).trim().slice(0, 100);
  const rawPage = Number.parseInt(scalar(searchParams.page), 10);
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.min(100, rawPage)) : 1;
  let result: Awaited<ReturnType<typeof searchPublicFederalAwards>> | null = null;
  try {
    result = await searchPublicFederalAwards({ recipient, page, limit: compact ? 7 : 20 });
  } catch {
    // Source might be temporarily unavailable; never invent or replace real records.
  }
  const base = "/contracts";
  const params = new URLSearchParams();
  if (recipient) params.set("recipient", recipient);
  const prevParams = new URLSearchParams(params);
  const nextParams = new URLSearchParams(params);
  prevParams.set("page", String(page - 1));
  nextParams.set("page", String(page + 1));

  return <section className={compact ? "official-source-section official-source-compact" : "official-source-section"}>
    <div className="official-source-header">
      <div>
        <p className="studio-section-label">PUBLIC SOURCE / USAspending.gov</p>
        <h2>{compact ? "Current federal award activity" : "Browse U.S. federal contract records"}</h2>
        <p>Direct official-source data. Limited to the past 12 months of modified federal contract awards, refreshed through a 15-minute cache. These are award values, not company revenue or expansion forecasts.</p>
      </div>
      <a href="https://www.usaspending.gov/search" target="_blank" rel="noreferrer">Open USAspending ↗</a>
    </div>
    {!compact ? <form action={base} method="get" role="search" className="official-source-search">
      <label htmlFor="official-recipient">Search recipient name</label>
      <div><input id="official-recipient" name="recipient" defaultValue={recipient} placeholder="Search a federal contractor" /><button className="button primary" type="submit">Search awards</button><Link className="button secondary" href={base}>Clear</Link></div>
    </form> : null}
    {!result
      ? <div className="official-source-note"><strong>Official contract feed is currently unavailable.</strong><p>The source request could not be completed. Existing company records have not been replaced with sample data.</p></div>
      : result.awards.length
        ? <>
          <div className="official-source-table-wrap"><table className="data-table official-source-table">
            <thead><tr><th>Last modified</th><th>Recipient / contract</th><th>Awarding agency</th><th className="numeric">Reported award amount</th><th>Source</th></tr></thead>
            <tbody>{result.awards.map(award => <tr key={award.internalId}>
              <td>{dateLabel(award.modified)}</td>
              <td><strong>{award.recipient}</strong><small>{award.description || award.awardId}</small></td>
              <td>{award.agency}</td>
              <td className="numeric">{compactMoney(award.amount)}</td>
              <td><a target="_blank" rel="noreferrer" href={award.sourceUrl}>Official record ↗</a></td>
            </tr>)}</tbody>
          </table></div>
          {!compact ? <div className="official-source-pagination">
            <span>Page {page} · USAspending source data</span>
            <div>{page > 1 ? <Link href={`${base}?${prevParams.toString()}`}>← Previous</Link> : null}
              {result.hasNext ? <Link href={`${base}?${nextParams.toString()}`}>Next →</Link> : null}</div>
          </div> : <div className="official-source-actions"><Link href="/contracts">Search official federal records ↗</Link></div>}
        </>
        : <div className="empty-panel"><strong>No matching public federal awards in the last 12 months.</strong><p>Try a different recipient name.</p></div>}
    <p className="official-source-disclaimer"><strong>Limited public-source mode.</strong> Company profiles, complete histories, watchlists and expansion/retention assessments require the BusinessCurrent PostgreSQL database. This feed is a separate direct-source view, not a substitute.</p>
  </section>;
}
