import { AdminDataClient } from "@/components/AdminDataClient";

export const dynamic = "force-dynamic";

export default function AdminDataPage() {
  return <><section className="page-heading"><p className="eyebrow">Internal operations</p><h1>Data health and capacity</h1><p>This view retrieves protected ingestion, market, and database statistics. The token stays in this browser session and is never embedded in the page.</p></section><AdminDataClient /></>;
}
