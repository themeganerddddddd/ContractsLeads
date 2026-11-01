import SearchPage from "@/app/search/page";

type RawParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Government Business", description: "Search government contracts and procurement evidence." };

export default async function ContractsPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  return SearchPage({ searchParams: Promise.resolve({ ...raw, mode: "contracts" }) });
}
