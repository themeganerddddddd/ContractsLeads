import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { publicAppUrl } from "@/lib/config";
import "./globals.css";
import "./product.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicAppUrl()),
  title: {
    default: "BusinessCurrent — Business change intelligence, nationwide",
    template: "%s | BusinessCurrent",
  },
  description:
    "Track businesses opening, growing, moving, shrinking, and closing across the United States using source-backed public data.",
  robots: { index: true, follow: true },
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
            <main className="page-shell bc-main">{children}</main>
            <Footer />
          </div>
        </div>
      </body>
    </html>
  );
}
