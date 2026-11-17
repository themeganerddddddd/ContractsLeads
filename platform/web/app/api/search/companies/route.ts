import { NextRequest } from "next/server";
import { resolvePlan } from "@/lib/plan";
import { parseSearchInput, searchCompanies } from "@/lib/search";

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) return Response.json(
    { error: "Company database unavailable", fallback_url: "/companies" },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const input = parseSearchInput({ ...raw, mode: "companies" });
  return Response.json(await searchCompanies(input, await resolvePlan()));
}
