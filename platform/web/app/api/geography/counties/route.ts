import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Public filter options. Only county names already observed in sourced company records are returned. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const state = (params.get("state") || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) {
    return NextResponse.json({ counties: [] }, { status: 400 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ counties: [] }, { headers: { "Cache-Control": "public, max-age=120" } });
  }
  try {
    const rows = await query<{ county: string }>(
      `SELECT DISTINCT recipient_county AS county
       FROM companies
       WHERE recipient_state = $1 AND recipient_county IS NOT NULL
         AND length(trim(recipient_county)) > 0
         AND NOT is_demo AND NOT is_benchmark
       ORDER BY county LIMIT 600`,
      [state],
    );
    return NextResponse.json(
      { counties: rows.map(row => row.county) },
      { headers: { "Cache-Control": "public, max-age=180, s-maxage=300" } },
    );
  } catch {
    return NextResponse.json({ counties: [] }, { status: 503 });
  }
}
