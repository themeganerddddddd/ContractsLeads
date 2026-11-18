import type { Metadata } from "next";
import { SiteShell } from "@/components/SiteShell";
import { publicAppUrl } from "@/lib/config";
import "./globals.css";
import "./product.css";
import "./research-product.css";
import "./firmquarry-public.css";
import "./firmquarry-refinement.css";

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
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
