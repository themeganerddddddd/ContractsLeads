import { getPublicDataReadiness } from "@/lib/public-data-readiness";

export const dynamic = "force-dynamic";

/** Public status returns only category labels, never secrets or internal exceptions. */
export async function GET() {
  const status = await getPublicDataReadiness();
  const healthy = status === "ready";
  return Response.json({
    company_data: healthy ? "available" : "unavailable",
    status,
    official_source_fallback: "USAspending.gov",
    company_intelligence_available: healthy,
  }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
