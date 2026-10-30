import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { publicAppUrl } from "@/lib/config";
import "./globals.css";

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
        <Header />
        <main className="page-shell">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
