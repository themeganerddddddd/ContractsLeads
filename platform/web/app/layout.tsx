import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { publicAppUrl } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(publicAppUrl()),
  title: {
    default: "Federal Ledger — Business Change Intelligence",
    template: "%s | Federal Ledger",
  },
  description:
    "Find source-backed signals of businesses opening, growing, moving, closing, shrinking, and forming in a market.",
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
