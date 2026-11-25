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
