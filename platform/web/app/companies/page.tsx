import { CompanyDirectory } from "@/components/CompanyDirectory";
type RawParams=Record<string,string|string[]|undefined>;
export const dynamic="force-dynamic";
export const metadata={title:"Companies",description:"Screen companies by U.S. state, county, industry, and verified government business. Search by company or legal name."};
export default function CompaniesPage({searchParams}:{searchParams:Promise<RawParams>}) {
  return <CompanyDirectory searchParams={searchParams}/>;
}
