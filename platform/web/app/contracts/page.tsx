import SearchPage from "@/app/search/page";
import { OfficialContractsExplorer } from "@/components/OfficialContractsExplorer";
import { OfflineRecordsExplorer } from "@/components/OfflineRecordsExplorer";
import { getPublicDataReadiness } from "@/lib/public-data-readiness";

type RawParams = Record<string, string | string[] | undefined>;

export const dynamic = "force-dynamic";
export const metadata = { title: "Government Contracts", description: "Search U.S. federal contracts and source-linked historical procurement evidence." };

export default async function ContractsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  const readiness = await getPublicDataReadiness();
  if (readiness !== "ready") return <>
    <OfficialContractsExplorer searchParams={raw} />
    <OfflineRecordsExplorer compact showCompanies={false} />
  </>;
  return SearchPage({ searchParams: Promise.resolve({ ...raw, mode: "contracts" }) });
}
