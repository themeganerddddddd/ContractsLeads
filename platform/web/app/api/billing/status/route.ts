import { resolveViewer } from "@/lib/plan";

export async function GET() {
  const viewer = await resolveViewer();
  if (!viewer.user) return Response.json({ error: "Sign in required" }, { status: 401 });
  return Response.json({ plan: viewer.plan, active: viewer.plan !== "free" });
}
