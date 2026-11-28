import Link from "next/link";
import { ORG_TYPES } from "@/lib/auth/accounts";
import { canManageTeam } from "@/lib/auth/permissions";
import { requireOrgAccess } from "@/lib/auth/session";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const { user, org } = await requireOrgAccess(slug);
  return (
    <>
      {user.isSuperAdmin && (
        <div className="admin-banner">
          You’re viewing <strong>{org.name}</strong> as a super admin. Changes you make here affect this customer.{" "}
          <Link href="/admin">Back to all organizations</Link>
        </div>
      )}
      <div className="org-header">
        <div>
          <div className="muted small">
            {ORG_TYPES[org.type]}
            {org.carrierCode && ` · ${org.carrierCode}`}
          </div>
          <div className="org-name">{org.name}</div>
        </div>
        <nav className="org-nav" aria-label="Organization">
          <Link href={`/o/${org.slug}`}>Bookings</Link>
          <Link href={`/o/${org.slug}/vessels`}>Vessels</Link>
          {org.type !== "ocean_carrier" && <Link href={`/o/${org.slug}/carriers`}>Carriers</Link>}
          {org.type !== "ocean_carrier" && <Link href={`/o/${org.slug}/rates`}>Rates</Link>}
          {canManageTeam(user, org) && <Link href={`/o/${org.slug}/team`}>Team</Link>}
        </nav>
      </div>
      {children}
    </>
  );
}
