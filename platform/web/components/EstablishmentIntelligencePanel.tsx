import Link from "next/link";

import { dateLabel, reported } from "@/lib/format";

type Row = Record<string, unknown>;

export function EstablishmentIntelligencePanel({ data }: { data: { establishments: Row[]; recentChanges: Row[] } }) {
  return <div className="split-grid"><div className="panel"><h3>Locations</h3>{data.establishments.length ? <ul className="plain-list">{data.establishments.map((row) => <li key={String(row.id)}><strong><Link href={`/establishment/${row.id}`}>{String(row.establishment_name)}</Link></strong><span>{reported([row.city, row.county, row.state_code].filter(Boolean).join(", "))} · {String(row.location_status).replaceAll("_", " ")} · {String(row.location_precision).replaceAll("_", " ")}</span></li>)}</ul> : <p>No verified or unresolved establishment candidates are linked to this company.</p>}</div><div className="panel"><h3>Recent business change</h3>{data.recentChanges.length ? <ul className="plain-list">{data.recentChanges.map((row, index) => <li key={`${row.layer}-${row.change_type}-${row.change_date}-${index}`}><strong>{String(row.change_type).replaceAll("_", " ")}</strong><span>{dateLabel(row.change_date as string)} · {String(row.layer)}{row.band ? ` · ${String(row.band).replaceAll("_", " ")}` : ""}{row.source_url ? <> · <a href={String(row.source_url)} target="_blank" rel="noreferrer">source ↗</a></> : null}</span></li>)}</ul> : <p>No establishment outcome or indication is stored for this company.</p>}</div></div>;
}
