import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ResearchTopbar } from "@/components/ResearchTopbar";
import { SupportLauncher } from "@/components/SupportLauncher";
import { publicAppUrl } from "@/lib/config";
import "./globals.css";
import "./product.css";
import "./research-product.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicAppUrl()),
  title: {
    default: "FirmQuarry — Business change intelligence, nationwide",
    template: "%s | FirmQuarry",
  },
  description:
    "Track businesses opening, growing, moving, shrinking, and closing across the United States using source-backed public data.",
  robots: { index: true, follow: true },
  openGraph: { type: "website", siteName: "FirmQuarry", title: "FirmQuarry — Company intelligence", description: "Research companies, opportunities, and source-backed business changes." },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <div className="bc-app-shell">
          <Header />
          <div className="bc-app-content">
            <ResearchTopbar />
            <main className="page-shell bc-main">{children}</main>
            <Footer />
            <SupportLauncher />
          </div>
        </div>
      </body>
    </html>
  );
}
