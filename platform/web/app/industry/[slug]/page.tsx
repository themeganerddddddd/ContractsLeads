import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketProfile } from "@/components/MarketProfile";
import { getIndustryProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; return { title: slug.replaceAll("-", " "), description: "Federal contract market by industry, company, agency, and geography." }; }
export default async function IndustryPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const data=await getIndustryProfile(slug); if(!data) notFound(); return <MarketProfile kind="Industry" title={data.industry.name} description={data.industry.description} data={data} />; }
