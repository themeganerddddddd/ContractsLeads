"use client";

import { usePathname } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PublicHeader } from "@/components/PublicHeader";
import { ResearchTopbar } from "@/components/ResearchTopbar";

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const publicPage = isLanding || pathname === "/sign-in" || pathname === "/pricing";

  return (
    <div className={`bc-app-shell${publicPage ? " fq-public-shell" : ""}`}>
      {publicPage ? <PublicHeader /> : <Header />}
      <div className="bc-app-content">
        {!publicPage ? <ResearchTopbar /> : null}
        <main className={`page-shell bc-main${isLanding ? " fq-landing-main" : publicPage ? " fq-public-main" : ""}`}>
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
