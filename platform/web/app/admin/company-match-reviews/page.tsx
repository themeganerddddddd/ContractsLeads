import { AdminCompanyTrackingClient } from "@/components/AdminCompanyTrackingClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Company tracking review" };

export default function CompanyMatchReviewsPage() {
  return <>
    <section className="page-heading"><p className="eyebrow">Internal analyst controls</p><h1>Company tracking and match review</h1><p>Search canonical entities, manage the platform monitor registry, and approve or reject source matches. The internal token remains in this browser session and every mutation records an actor and audit row.</p></section>
    <AdminCompanyTrackingClient />
  </>;
}
