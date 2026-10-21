import { NextRequest } from "next/server";
import { resolvePlan } from "@/lib/plan";
import { parseSearchInput, searchContracts } from "@/lib/search";

export async function GET(request: NextRequest) {
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const input = parseSearchInput({ ...raw, mode: "contracts" });
  return Response.json(await searchContracts(input, await resolvePlan()));
}
