import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { accountService } from "@/lib/service";
import type { Organization, User } from "./accounts";
import { canAccessOrg, canManageTeam } from "./permissions";
import { publicBaseUrl } from "@/lib/publicUrl";

/**
 * Request-level auth helpers. Every page AND every server action calls one of the
 * require* functions: server actions are public endpoints, so page checks alone aren't enough.
 */
const COOKIE = "efficio_session";

export async function startSession(userId: number): Promise<void> {
  const { token, expiresAt } = accountService().createSession(userId);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.EFFICIO_INSECURE_COOKIES !== "1",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) accountService().deleteSession(token);
  jar.delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? accountService().getSessionUser(token) : null;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireSuperAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isSuperAdmin) notFound();
  return user;
}

/** The org in the URL, if this user may see it. Unknown and forbidden orgs both 404 so slugs can't be probed. */
export async function requireOrgAccess(slug: string): Promise<{ user: User; org: Organization }> {
  const user = await requireUser();
  const org = accountService().getOrganizationBySlug(slug);
  if (!org || !canAccessOrg(user, org)) notFound();
  return { user, org };
}

export async function requireTeamManager(slug: string): Promise<{ user: User; org: Organization }> {
  const ctx = await requireOrgAccess(slug);
  if (!canManageTeam(ctx.user, ctx.org)) notFound();
  return ctx;
}

/** Where a user lands after login. */
export function homePath(user: User): string {
  if (user.isSuperAdmin) return "/admin";
  const org = user.orgId === null ? null : accountService().getOrganization(user.orgId);
  return org ? `/o/${org.slug}` : "/login";
}

/** Absolute base URL for invite links, from the incoming request. */
export async function baseUrl(): Promise<string> {
  const configured = publicBaseUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
