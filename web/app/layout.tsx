import type { Metadata } from "next";
import { DM_Sans, Unbounded } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { WalletBadge } from "@/components/wallet/WalletBadge";
import { Providers } from "./providers";

const display = Unbounded({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display-face", display: "swap" });
const body = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body-face", display: "swap" });

export const metadata: Metadata = {
  title: "Likeness",
  description: "Licence your face to AI, on your terms, and pull it back any time.",
};

const nav = [
  { href: "/onboard", label: "Creators" },
  { href: "/market", label: "Marketplace" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/generate", label: "Generate" },
  { href: "/verify", label: "Verify" },
  { href: "/status", label: "Status" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>
          <header className="border-b border-line-soft">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-5">
              <Link href="/" className="font-display text-lg font-semibold tracking-tight">
                Likeness
              </Link>
              <nav className="flex items-center gap-7 text-sm text-muted">
                {nav.map((n) => (
                  <Link key={n.href} href={n.href} className="hover:text-text">
                    {n.label}
                  </Link>
                ))}
                <WalletBadge />
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-8 py-12">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
