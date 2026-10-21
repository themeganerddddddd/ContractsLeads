import { NextRequest } from "next/server";
import { resolvePlan } from "@/lib/plan";
import { parseSearchInput, searchCompanies } from "@/lib/search";

export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const input = parseSearchInput({ ...raw, mode: "companies" });
  return Response.json(await searchCompanies(input, await resolvePlan()));
}
