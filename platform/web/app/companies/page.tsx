import SearchPage from "@/app/search/page";

type RawParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Companies", description: "Search BusinessCurrent company intelligence profiles." };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const raw = await searchParams;
  return SearchPage({ searchParams: Promise.resolve({ ...raw, mode: "companies" }) });
}
