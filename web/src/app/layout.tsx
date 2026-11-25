import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { getPortAdapter } from "@/lib/ports";
import { logoutAction } from "./auth-actions";
import "./globals.css";

export const metadata: Metadata = {
  title: "Efficio",
  description: "Booking visibility for exporters, straight from the terminal.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const adapter = getPortAdapter();
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="header-left">
            <Link href="/" className="brand">
              Efficio
            </Link>
            {user?.isSuperAdmin && (
              <Link href="/admin" className="header-link">
                All organizations
              </Link>
            )}
          </div>
          <div className="header-right">
            <span className={`source source-${adapter.source}`} title="Where booking data comes from">
              Data: {adapter.displayName}
            </span>
            {user && (
              <>
                <span className="muted small" title={user.email}>
                  {user.name}
                  {user.isSuperAdmin && " · super admin"}
                </span>
                <form action={logoutAction}>
                  <button type="submit" className="link-button">
                    Sign out
                  </button>
                </form>
              </>
            )}
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
