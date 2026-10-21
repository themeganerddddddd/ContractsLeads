import { z } from "zod";
import { currentUser, ensureDatabaseUser } from "@/lib/auth-user";
import { query } from "@/lib/db";
import { can } from "@/lib/entitlements";
import { resolvePlan } from "@/lib/plan";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  query_json: z.record(z.string(), z.unknown()),
  alert_frequency: z.enum(["none","weekly","daily"]).default("none")
});

async function context() {
  const user = await currentUser();
  if (!user) return null;
  const plan = await resolvePlan();
  if (!can(plan, "saved_searches")) return { error: "Saved searches require Local or above", status: 403 } as const;
  return { userId: await ensureDatabaseUser(user), plan };
}

export async function GET() {
  const auth = await context();
  if (!auth || "error" in auth) return Response.json({ error: auth?.error || "Sign in required" }, { status: auth?.status || 401 });
  return Response.json(await query("SELECT id::text,name,query_json,alert_frequency,last_run,created_at,updated_at FROM saved_searches WHERE user_id=$1 ORDER BY updated_at DESC", [auth.userId]));
}

export async function POST(request: Request) {
  const auth = await context();
  if (!auth || "error" in auth) return Response.json({ error: auth?.error || "Sign in required" }, { status: auth?.status || 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid saved search" }, { status: 400 });
  if (parsed.data.alert_frequency === "daily" && !can(auth.plan, "daily_alerts")) return Response.json({ error: "Daily alerts require Pro or above" }, { status: 403 });
  if (parsed.data.alert_frequency === "weekly" && !can(auth.plan, "weekly_alerts")) return Response.json({ error: "Weekly alerts require Local or above" }, { status: 403 });
  const encoded = JSON.stringify(parsed.data.query_json);
  if (encoded.length > 20_000) return Response.json({ error: "Search is too large to save" }, { status: 400 });
  const rows = await query(
    "INSERT INTO saved_searches (user_id,name,query_json,alert_frequency) VALUES ($1,$2,$3::jsonb,$4) RETURNING id::text,name,query_json,alert_frequency,created_at,updated_at",
    [auth.userId, parsed.data.name, encoded, parsed.data.alert_frequency]
  );
  return Response.json(rows[0], { status: 201 });
}
