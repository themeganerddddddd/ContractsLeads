import { CompanyDirectory } from "@/components/CompanyDirectory";
type RawParams=Record<string,string|string[]|undefined>;
export const dynamic="force-dynamic";
export const metadata={title:"Locations",description:"Find U.S. companies by state, County / Parish / Local Area and city, preserving geographic evidence and source limitations."};
export default function LocationsPage({searchParams}:{searchParams:Promise<RawParams>}) {
  return <CompanyDirectory searchParams={searchParams} locationFocus/>;
}
