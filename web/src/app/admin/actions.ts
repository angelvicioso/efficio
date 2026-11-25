"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccountError, ORG_TYPES, type OrgType } from "@/lib/auth/accounts";
import { baseUrl, requireSuperAdmin } from "@/lib/auth/session";
import { accountService } from "@/lib/service";
import type { FormState } from "../ActionForm";

function fail(e: unknown): FormState {
  if (e instanceof AccountError) return { error: e.message };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}

export async function createOrganizationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const type = String(formData.get("type") ?? "exporter") as OrgType;
  if (!(type in ORG_TYPES)) return { error: "Choose an organization type." };
  let slug: string;
  try {
    const org = accountService().createOrganization({
      name: String(formData.get("name") ?? ""),
      type,
      domains: String(formData.get("domains") ?? "").split(/[,\s]+/).filter(Boolean),
      carrierCode: type === "ocean_carrier" ? String(formData.get("carrierCode") ?? "") : null,
    });
    slug = org.slug;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin");
  redirect(`/o/${slug}/team`);
}

export async function inviteSuperAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSuperAdmin();
  try {
    const { token, invite } = accountService().createInvite({
      email: String(formData.get("email") ?? ""),
      isSuperAdmin: true,
      createdBy: me.id,
    });
    revalidatePath("/admin");
    return {
      message: `Invite created for ${invite.email}. Send them this link. It works once and expires in 7 days.`,
      link: `${await baseUrl()}/invite/${token}`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeSuperAdminInviteAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  accountService().revokeInvite(String(formData.get("inviteId") ?? ""), null);
  revalidatePath("/admin");
}

export async function setSuperAdminDisabledAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireSuperAdmin();
  const userId = Number(formData.get("userId"));
  const target = accountService().getUser(userId);
  if (!target?.isSuperAdmin) return { error: "User not found." };
  if (target.id === me.id) return { error: "You can't disable your own account." };
  try {
    accountService().setDisabled(userId, formData.get("disabled") === "1");
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin");
  return {};
}

/** Lift a super admin's sign-in lockout (R-014). */
export async function unlockSuperAdminAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const target = accountService().getUser(Number(formData.get("userId")));
  if (target?.isSuperAdmin) accountService().unlock(target.email);
  revalidatePath("/admin");
}

/** Hosted-safe sample data (D-026): sample companies and simulated bookings, no logins. */
export async function addSampleDataAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const { addSampleData, SampleDataError } = await import("@/lib/demo/sample");
  const { bookingService } = await import("@/lib/service");
  const { getPortAdapter } = await import("@/lib/ports");
  try {
    await addSampleData(accountService(), bookingService(), getPortAdapter().source);
  } catch (e) {
    if (e instanceof SampleDataError) return { error: e.message };
    return fail(e);
  }
  revalidatePath("/admin");
  return { message: "Sample companies added. Open one below to explore, or invite someone into it." };
}

export async function removeSampleDataAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const { removeSampleData } = await import("@/lib/demo/sample");
  const { bookingService } = await import("@/lib/service");
  const { getDb } = await import("@/lib/db");
  const n = removeSampleData(getDb(), accountService(), bookingService());
  revalidatePath("/admin");
  return { message: n ? `Removed ${n} sample compan${n === 1 ? "y" : "ies"} and their bookings.` : "No sample data to remove." };
}

/** Super admin diagnostic: one call to each Port Houston endpoint, masked output (S-013). */
export async function checkPortHoustonAction(_prev: FormState, _formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const { runPortHoustonCheck } = await import("@/lib/ports/navis/check");
  const lines = await runPortHoustonCheck();
  return { details: lines.join("\n") };
}

/** Super admin diagnostic: live lookup of one booking, step by step (S-013). */
export async function checkBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  const carrierCode = String(formData.get("carrierCode") ?? "");
  const bookingNumber = String(formData.get("bookingNumber") ?? "").trim();
  if (!carrierCode || !/^[A-Za-z0-9-]{4,30}$/.test(bookingNumber)) return { error: "Choose a carrier and enter a booking number." };
  const { runBookingCheck } = await import("@/lib/ports/navis/check");
  return { details: (await runBookingCheck(carrierCode, bookingNumber)).join("\n") };
}
