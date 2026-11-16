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
  return <OfflineRecordsExplorer query={q||""}/>;
}
