import type { Organization, User } from "./accounts";

/** Super admins can see every organization; everyone else only their own. */
export function canAccessOrg(user: User, org: Organization): boolean {
  return user.isSuperAdmin || user.orgId === org.id;
}

/** Org admins manage their own team; super admins manage any team. */
export function canManageTeam(user: User, org: Organization): boolean {
  return user.isSuperAdmin || (user.orgId === org.id && user.orgRole === "admin");
}

/** Only super admins change an organization's email domains or create organizations. */
export function canManageOrgSettings(user: User): boolean {
  return user.isSuperAdmin;
}
