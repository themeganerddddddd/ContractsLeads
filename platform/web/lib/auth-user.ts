import "server-only";
import { auth } from "@/auth";
import { developmentMockEnabled, validateRuntimeConfig } from "@/lib/config";
import { query } from "@/lib/db";

export type AppUser = { externalAuthId: string; email: string; name: string };

export async function currentUser(): Promise<AppUser | null> {
  validateRuntimeConfig();
  if (developmentMockEnabled("DEV_AUTH")) {
    return {
      externalAuthId: "development-user",
      email: process.env.DEV_USER_EMAIL || "developer@example.test",
      name: "Development User",
    };
  }
  const session = await auth();
  if (!session?.user?.email) return null;
  return {
    externalAuthId: session.user.email,
    email: session.user.email,
    name: session.user.name || session.user.email,
  };
}

export async function ensureDatabaseUser(user: AppUser): Promise<string> {
  const rows = await query<{ id: string }>(
    `INSERT INTO users (external_auth_id,email,name) VALUES ($1,$2,$3)
     ON CONFLICT (email) DO UPDATE SET external_auth_id=COALESCE(users.external_auth_id,EXCLUDED.external_auth_id),name=EXCLUDED.name
     RETURNING id::text`,
    [user.externalAuthId, user.email, user.name],
  );
  return rows[0].id;
}
