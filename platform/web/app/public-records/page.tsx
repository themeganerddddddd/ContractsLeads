import type { Metadata } from "next";
import { OfflineRecordsExplorer } from "@/components/OfflineRecordsExplorer";
type RawParams = Record<string,string|string[]|undefined>;
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Public Source Archive — Montgomery County",
  description: "An openly dated Montgomery County company and contract archive accessible while the live PostgreSQL database is offline.",
  robots: {index:false,follow:true},
};
export default async function PublicRecordsPage({searchParams}:{searchParams:Promise<RawParams>}) {
  const raw=await searchParams;
  const q=Array.isArray(raw.q)?raw.q[0]:raw.q;
  const state=Array.isArray(raw.state)?raw.state[0]:raw.state;
  const county=Array.isArray(raw.county)?raw.county[0]:raw.county;
  const country=Array.isArray(raw.country)?raw.country[0]:raw.country;
  return <OfflineRecordsExplorer query={q||""} state={state||""} county={county||""} country={country||"US"}/>;
}
