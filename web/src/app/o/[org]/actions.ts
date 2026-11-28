"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccountError, type OrgRole } from "@/lib/auth/accounts";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { baseUrl, requireOrgAccess, requireTeamManager } from "@/lib/auth/session";
import { BookingError, type BatchResult } from "@/lib/bookings";
import { accountService, bookingService, mailService, ratesService } from "@/lib/service";
import { DEFAULT_RATES, RATE_KEYS } from "@/lib/domain/rates";
import { INVITE_DAYS, RESET_HOURS } from "@/lib/auth/accounts";
import { inviteEmail, passwordResetEmail } from "@/lib/email/templates";
import { emailNote } from "@/lib/email/note";
import type { FormState, ResultGroup } from "../../ActionForm";

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

/** Track one or many bookings (S-046). One number that works opens its page; otherwise a summary. */
export async function addBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireOrgAccess(slugOf(formData));
  // Carrier organizations can only add their own bookings.
  const carrierCode = org.carrierCode ?? String(formData.get("carrierCode") ?? "");
  let results: BatchResult[];
  try {
    results = await bookingService().addMany(org, { carrierCode, text: String(formData.get("bookingNumbers") ?? "") }, user.id);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/o/${org.slug}`, "layout");
  const only = results.length === 1 ? results[0] : null;
  if (only && (only.outcome === "added" || only.outcome === "already")) redirect(`/o/${org.slug}/bookings/${only.id}`);
  if (only) return { error: only.note ?? "Couldn't add this booking." };
  return { groups: summarizeBatch(org.slug, results) };
}

function summarizeBatch(slug: string, results: BatchResult[]): ResultGroup[] {
  const of = (o: BatchResult["outcome"]) => results.filter((r) => r.outcome === o);
  const link = (r: BatchResult) => ({ label: r.bookingNumber, href: r.id ? `/o/${slug}/bookings/${r.id}` : undefined });
  const groups: ResultGroup[] = [];
  const added = of("added");
  if (added.length) groups.push({ tone: "ok", title: `✓ ${added.length} now tracked`, items: added.map(link) });
  const already = of("already");
  if (already.length) groups.push({ tone: "info", title: `• ${already.length} already tracked`, items: already.map(link) });
  const needs = of("needs_carrier");
  if (needs.length) {
    groups.push({
      tone: "warn",
      title: `? ${needs.length} need a carrier`,
      items: needs.map((r) => ({ label: r.bookingNumber })),
      hint: "The terminal doesn't have these yet (or the number exists under several carriers). Choose the carrier above, then paste these again.",
      copy: needs.map((r) => r.bookingNumber).join("\n"),
    });
  }
  const invalid = of("invalid");
  if (invalid.length) {
    groups.push({ tone: "error", title: `✗ ${invalid.length} not ${invalid.length === 1 ? "a valid booking number" : "valid booking numbers"}`, items: invalid.map((r) => ({ label: r.bookingNumber })), hint: "Booking numbers are 4 to 30 letters, digits or dashes." });
  }
  const errors = of("error");
  if (errors.length) {
    groups.push({ tone: "error", title: `✗ ${errors.length} couldn't be added`, items: errors.map((r) => ({ label: r.bookingNumber })), hint: errors[0].note, copy: errors.map((r) => r.bookingNumber).join("\n") });
  }
  return groups;
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

/** Org admins (and super admins): stop tracking every booking (S-050). Requires the confirm box. */
export async function removeAllBookingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { org } = await requireTeamManager(slugOf(formData));
  if (formData.get("confirm") !== "yes") return { error: "Tick the box to confirm." };
  let n: number;
  try {
    n = bookingService().removeAll(org);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/o/${org.slug}`, "layout");
  return { message: `Stopped tracking ${n} booking${n === 1 ? "" : "s"}.` };
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
    const link = `${await baseUrl()}/invite/${token}`;
    const sent = await mailService().send(inviteEmail({ to: invite.email, inviterName: user.name, orgName: org.name, link, days: INVITE_DAYS }));
    return { message: `Invite for ${invite.email}: ${emailNote(sent)}. It works once and expires in ${INVITE_DAYS} days.`, link };
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

/** Lift a sign-in lockout (R-014) for someone on this team. */
export async function unlockMemberAction(formData: FormData): Promise<void> {
  const { org } = await requireTeamManager(slugOf(formData));
  const target = memberOf(org.id, Number(formData.get("userId")));
  if (target) accountService().unlock(target.email);
  revalidatePath(`/o/${org.slug}/team`);
}

/** Password reset link for someone on this team (D-032). */
export async function resetMemberPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireTeamManager(slugOf(formData));
  const target = memberOf(org.id, Number(formData.get("userId")));
  if (!target) return { error: "User not found." };
  if (target.id === user.id) return { error: "Ask another admin to reset your password." };
  const { token } = accountService().createPasswordReset(target.id, user.id);
  const link = `${await baseUrl()}/reset/${token}`;
  const sent = await mailService().send(passwordResetEmail({ to: target.email, link, hours: RESET_HOURS, byAdmin: user.name }));
  return { message: `Reset link for ${target.email}: ${emailNote(sent)}. It works once and expires in ${RESET_HOURS} hours.`, link };
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

// ---------- Rates (S-060) ----------

/** Saves a company's own rates. Blank goes back to the Efficio default. Org admins and super admins. */
export async function saveRatesAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user, org } = await requireTeamManager(slugOf(formData));
  const service = ratesService();
  const errors: string[] = [];
  for (const key of RATE_KEYS) {
    const raw = String(formData.get(key) ?? "").replace(/[$,\s]/g, "");
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1_000_000)) {
      errors.push(`${DEFAULT_RATES[key].label}: enter a number from 0 to 1,000,000.`);
      continue;
    }
    service.set(org.id, key, value, user.id);
  }
  revalidatePath(`/o/${org.slug}`, "layout");
  if (errors.length) return { error: `Some rates weren’t saved. ${errors.join(" ")}` };
  return { message: "Rates saved. Money at risk now uses them." };
}
