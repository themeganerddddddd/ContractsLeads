import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketProfile } from "@/components/MarketProfile";
import { getAgencyProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; return { title: slug.replaceAll("-", " "), description: "Federal agency contract activity, contractors, industries, and locations." }; }
export default async function AgencyPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const data=await getAgencyProfile(slug); if(!data) notFound(); return <MarketProfile kind="Agency" title={data.agency.name} description={data.agency.parent_department} data={data} />; }
