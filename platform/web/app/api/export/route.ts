import { NextRequest } from "next/server";
import { currentUser, ensureDatabaseUser } from "@/lib/auth-user";
import { contractsToCsv } from "@/lib/csv";
import { query } from "@/lib/db";
import { can, entitlementsFor } from "@/lib/entitlements";
import { resolvePlan } from "@/lib/plan";
import { parseSearchInput, searchContracts } from "@/lib/search";

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const plan = await resolvePlan();
  if (!can(plan, "csv_export")) return Response.json({ error: "CSV export requires Pro or above", upgrade: "/pricing" }, { status: 403 });
  const userId = await ensureDatabaseUser(user);
  const usage = await query<{ rows: string }>("SELECT COALESCE(sum(row_count),0)::text AS rows FROM exports WHERE user_id=$1 AND created_at>=date_trunc('month',now())", [userId]);
  const monthlyLimit = Number(entitlementsFor(plan).monthly_export_rows);
  const remaining = Math.max(0, monthlyLimit - Number(usage[0]?.rows || 0));
  if (!remaining) return Response.json({ error: "Monthly export row limit reached", limit: monthlyLimit }, { status: 403 });
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const input = parseSearchInput({ ...raw, mode: "contracts", page: "1", page_size: String(Math.min(100, remaining)) });
  const result = await searchContracts(input, plan, true);
  const rows = result.rows.slice(0, remaining);
  await query("INSERT INTO exports (user_id,format,row_count) VALUES ($1,'csv',$2)", [userId, rows.length]);
  return new Response(contractsToCsv(rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="federal-contracts-${new Date().toISOString().slice(0,10)}.csv"`, "cache-control": "private, no-store" } });
}
