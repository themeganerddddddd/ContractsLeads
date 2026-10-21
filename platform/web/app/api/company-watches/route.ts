import { z } from "zod";
import { currentUser, ensureDatabaseUser } from "@/lib/auth-user";
import { query } from "@/lib/db";
import { can } from "@/lib/entitlements";
import { resolvePlan } from "@/lib/plan";

const schema = z.object({ company_id: z.string().uuid() });

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  const userId = await ensureDatabaseUser(user);
  return Response.json(await query(
    `SELECT w.company_id::text,c.slug,c.canonical_name,w.created_at::text FROM company_watches w
     JOIN companies c ON c.id=w.company_id WHERE w.user_id=$1 ORDER BY w.created_at DESC`, [userId]
  ));
}

export async function POST(request: Request) {
  const [user, plan] = await Promise.all([currentUser(), resolvePlan()]);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!can(plan, "company_watches")) return Response.json({ error: "Company watches require Pro or above" }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid company" }, { status: 400 });
  const userId = await ensureDatabaseUser(user);
  const rows = await query(
    `INSERT INTO company_watches (user_id,company_id) VALUES ($1,$2)
     ON CONFLICT (user_id,company_id) DO NOTHING RETURNING company_id::text,created_at::text`,
    [userId, parsed.data.company_id]
  );
  return Response.json(rows[0] || { company_id: parsed.data.company_id, already_watching: true }, { status: rows.length ? 201 : 200 });
}
