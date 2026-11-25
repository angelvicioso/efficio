"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccountError, type OrgRole } from "@/lib/auth/accounts";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { baseUrl, requireOrgAccess, requireTeamManager } from "@/lib/auth/session";
import { BookingError } from "@/lib/bookings";
import { accountService, bookingService } from "@/lib/service";
import type { FormState } from "../../ActionForm";

/**
 * Every action re-checks access from the org slug in the form, and every
 * booking/user lookup is scoped to that org, so IDs from another org do nothing.
 */
function slugOf(formData: FormData): string {
  return String(formData.get("org") ?? "");
}

function fail(e: unknown): FormState {
  if (e instanceof AccountError || e instanceof BookingError) return { error: e.message };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}

// ---------- Bookings ----------

export async function addBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireOrgAccess(slugOf(formData));
  let id: number;
  try {
    ({ id } = await bookingService().add(
      org,
      {
        // Carrier organizations can only add their own bookings.
        carrierCode: org.carrierCode ?? String(formData.get("carrierCode") ?? ""),
        bookingNumber: String(formData.get("bookingNumber") ?? ""),
      },
      user.id,
    ));
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/o/${org.slug}`);
  redirect(`/o/${org.slug}/bookings/${id}`);
}

export async function refreshBookingAction(formData: FormData): Promise<void> {
  const { org } = await requireOrgAccess(slugOf(formData));
  const id = Number(formData.get("id"));
  if (!bookingService().access(org, id)) return;
  await bookingService().refresh(org, id);
  revalidatePath(`/o/${org.slug}`, "layout");
}

export async function refreshAllAction(formData: FormData): Promise<void> {
  const { org } = await requireOrgAccess(slugOf(formData));
  await bookingService().refreshAll(org);
  revalidatePath(`/o/${org.slug}`);
}

export async function removeBookingAction(formData: FormData): Promise<void> {
  const { org } = await requireOrgAccess(slugOf(formData));
  bookingService().remove(org, Number(formData.get("id")));
  revalidatePath(`/o/${org.slug}`);
  redirect(`/o/${org.slug}`);
}

/** Carrier only: confirm or remove a company that claimed one of its bookings. */
export async function verifyPartyAction(formData: FormData): Promise<void> {
  const { org } = await requireOrgAccess(slugOf(formData));
  const id = Number(formData.get("id"));
  try {
    bookingService().verifyParty(org, id, Number(formData.get("partyOrgId")));
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
  }
  revalidatePath(`/o/${org.slug}/bookings/${id}`);
}

export async function removePartyAction(formData: FormData): Promise<void> {
  const { org } = await requireOrgAccess(slugOf(formData));
  const id = Number(formData.get("id"));
  try {
    bookingService().removeParty(org, id, Number(formData.get("partyOrgId")));
  } catch (e) {
    if (!(e instanceof BookingError)) throw e;
  }
  revalidatePath(`/o/${org.slug}/bookings/${id}`);
}

// ---------- Team ----------

export async function inviteMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireTeamManager(slugOf(formData));
  const role: OrgRole = formData.get("role") === "admin" ? "admin" : "member";
  try {
    const { token, invite } = accountService().createInvite({
      email: String(formData.get("email") ?? ""),
      orgId: org.id,
      orgRole: role,
      createdBy: user.id,
      // Only super admins may invite outside the org's domains.
      allowOtherDomain: user.isSuperAdmin && formData.get("allowOtherDomain") === "on",
    });
    revalidatePath(`/o/${org.slug}/team`);
    return {
      message: `Invite created for ${invite.email}. Send them this link. It works once and expires in 7 days.`,
      link: `${await baseUrl()}/invite/${token}`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const { org } = await requireTeamManager(slugOf(formData));
  accountService().revokeInvite(String(formData.get("inviteId") ?? ""), org.id);
  revalidatePath(`/o/${org.slug}/team`);
}

/** Loads a user only if they belong to this org (never a super admin or another org's user). */
function memberOf(orgId: number, userId: number) {
  const target = accountService().getUser(userId);
  return target && target.orgId === orgId ? target : null;
}

export async function setRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireTeamManager(slugOf(formData));
  const target = memberOf(org.id, Number(formData.get("userId")));
  if (!target) return { error: "User not found." };
  try {
    accountService().setOrgRole(target.id, formData.get("role") === "admin" ? "admin" : "member");
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/o/${org.slug}/team`);
  return {};
}

export async function setDisabledAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireTeamManager(slugOf(formData));
  const target = memberOf(org.id, Number(formData.get("userId")));
  if (!target) return { error: "User not found." };
  if (target.id === user.id) return { error: "You can't disable your own account." };
  try {
    accountService().setDisabled(target.id, formData.get("disabled") === "1");
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/o/${org.slug}/team`);
  return {};
}

// ---------- Organization settings (super admins) ----------

export async function addDomainAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireOrgAccess(slugOf(formData));
  if (!canManageOrgSettings(user)) return { error: "Only super admins can change domains." };
  try {
    accountService().addDomain(org.id, String(formData.get("domain") ?? ""));
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/o/${org.slug}/team`);
  return {};
}

export async function removeDomainAction(formData: FormData): Promise<void> {
  const { user, org } = await requireOrgAccess(slugOf(formData));
  if (!canManageOrgSettings(user)) return;
  accountService().removeDomain(org.id, String(formData.get("domain") ?? ""));
  revalidatePath(`/o/${org.slug}/team`);
}
