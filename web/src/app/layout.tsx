import type { Metadata } from "next";
import Link from "next/link";
import { getPortAdapter } from "@/lib/ports";
import "./globals.css";

export const metadata: Metadata = {
  title: "Efficio",
  description: "Booking visibility for exporters, straight from the terminal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const adapter = getPortAdapter();
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link href="/" className="brand">
            Efficio
          </Link>
          <span className={`source source-${adapter.source}`} title="Where booking data comes from">
            Data: {adapter.displayName}
          </span>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
