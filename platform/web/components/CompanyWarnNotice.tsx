import type { CompanySnapshotRow } from "@/lib/company-intelligence";
import { dateLabel } from "@/lib/format";

export function CompanyWarnNotice({snapshot}:{snapshot:CompanySnapshotRow|null}) {
  const count=snapshot?.warn_notice_count_24m||0;
  if(count<1)return null;
  const url=snapshot?.latest_warn_source_url;
  return <aside className="fq-warn-panel" id="workforce-notices" aria-label="Verified WARN workforce notices">
    <div className="fq-warn-emblem" aria-hidden="true">!</div>
    <div className="fq-warn-panel-content">
      <p className="eyebrow">RETENTION EVIDENCE / VERIFIED WORKFORCE NOTICE</p>
      <h2>{count} official WARN notice{count===1?"":"s"} linked to this company</h2>
      <p>{snapshot?.warn_jobs_affected_24m
        ? `${snapshot.warn_jobs_affected_24m.toLocaleString()} reported affected positions across linked notices. `
        : ""}
        A WARN filing signals a planned or reported workforce action, not proof that a company will close, relocate, or reduce operations at every site.
      </p>
      <small>MD/VA official feeds only · last 24 months · latest: {dateLabel(snapshot?.latest_warn_date || null)}</small>
    </div>
    {url && /^https:\/\//.test(url) ? <a href={url} target="_blank" rel="noopener noreferrer">View official notice ↗</a> : null}
  </aside>;
}
