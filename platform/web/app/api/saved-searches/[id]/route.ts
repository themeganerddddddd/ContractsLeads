import { z } from "zod";
import { currentUser, ensureDatabaseUser } from "@/lib/auth-user";
import { query } from "@/lib/db";
import { can } from "@/lib/entitlements";
import { resolvePlan } from "@/lib/plan";

async function userId() {
  const user = await currentUser();
  if (!user || !can(await resolvePlan(), "saved_searches")) return null;
  return ensureDatabaseUser(user);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await userId();
  if (!owner) return Response.json({ error: "Not authorized" }, { status: 401 });
  const parsed = z.object({ name: z.string().trim().min(1).max(120).optional(), alert_frequency: z.enum(["none","weekly","daily"]).optional() }).safeParse(await request.json());
  if (!parsed.success || (!parsed.data.name && !parsed.data.alert_frequency)) return Response.json({ error: "Invalid update" }, { status: 400 });
  const { id } = await params;
  const rows = await query(
    "UPDATE saved_searches SET name=COALESCE($1,name),alert_frequency=COALESCE($2,alert_frequency) WHERE id=$3 AND user_id=$4 RETURNING id::text,name,query_json,alert_frequency,updated_at",
    [parsed.data.name, parsed.data.alert_frequency, id, owner]
  );
  if (!rows.length) return Response.json({ error: "Saved search not found" }, { status: 404 });
  return Response.json(rows[0]);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await userId();
  if (!owner) return Response.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await params;
  const rows = await query("DELETE FROM saved_searches WHERE id=$1 AND user_id=$2 RETURNING id", [id, owner]);
  if (!rows.length) return Response.json({ error: "Saved search not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
