import { DatabaseNotice } from "@/components/DatabaseNotice";
import { PaywallNotice } from "@/components/PaywallNotice";
import { SavedSearchesClient } from "@/components/SavedSearchesClient";
import { currentUser, ensureDatabaseUser } from "@/lib/auth-user";
import { query } from "@/lib/db";
import { can } from "@/lib/entitlements";
import { resolvePlan } from "@/lib/plan";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saved searches", robots: { index: false, follow: false } };

export default async function SavedSearchesPage() {
  try {
    const user=await currentUser(); const plan=await resolvePlan();
    if(!user)return <><section className="page-heading"><h1>Saved searches</h1></section><div className="notice">Sign in to manage saved searches.</div></>;
    if(!can(plan,"saved_searches"))return <><section className="page-heading"><h1>Saved searches</h1></section><PaywallNotice title="Saved searches are available on Local and above">Upgrade to retain filters and prepare weekly or daily alerts.</PaywallNotice></>;
    const userId=await ensureDatabaseUser(user); const rows=await query<any>("SELECT id::text,name,query_json,alert_frequency,updated_at::text FROM saved_searches WHERE user_id=$1 ORDER BY updated_at DESC",[userId]);
    return <><section className="page-heading"><p className="eyebrow">Workspace</p><h1>Saved searches</h1><p>Rerun, rename, and delete structured searches. Alert delivery is represented in the data model and can be connected to a worker later.</p></section><SavedSearchesClient initial={rows}/></>;
  } catch(cause){return <><section className="page-heading"><h1>Saved searches</h1></section><DatabaseNotice message={cause instanceof Error?cause.message:String(cause)}/></>;}
}
