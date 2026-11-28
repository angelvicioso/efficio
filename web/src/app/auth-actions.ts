"use server";

import { redirect } from "next/navigation";
import { AccountError, MAX_FAILED_LOGINS } from "@/lib/auth/accounts";
import { formatTime } from "@/lib/format";
import { setupTokenValid } from "@/lib/auth/setupToken";
import { endSession, homePath, startSession } from "@/lib/auth/session";
import { accountService } from "@/lib/service";
import type { FormState } from "./ActionForm";

function message(e: unknown): string {
  if (e instanceof AccountError) return e.message;
  console.error(e);
  return "Something went wrong. Please try again.";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await accountService().authenticate(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!result.ok) {
    if (result.reason === "locked") {
      return {
        error: `Too many failed sign-in attempts. Try again after ${formatTime(result.lockedUntil)} (Houston time), or ask your company's Efficio admin to unlock your account.`,
      };
    }
    return { error: `That email and password don't match an active account. After ${MAX_FAILED_LOGINS} failed attempts, sign-in is locked for an hour.` };
  }
  await startSession(result.user.id);
  redirect(homePath(result.user));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Checked here too: server actions can be called directly, not just from the page.
  if (!setupTokenValid(String(formData.get("setupToken") ?? ""))) return { error: "The setup link is missing or wrong." };
  let userId: number;
  try {
    const user = await accountService().setupFirstSuperAdmin({
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    userId = user.id;
  } catch (e) {
    return { error: message(e) };
  }
  await startSession(userId);
  redirect("/admin");
}

export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) return { error: "The passwords don't match." };
  let user;
  try {
    user = await accountService().acceptInvite(String(formData.get("token") ?? ""), {
      name: String(formData.get("name") ?? ""),
      password,
    });
  } catch (e) {
    return { error: message(e) };
  }
  await startSession(user.id);
  redirect(homePath(user));
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) return { error: "The passwords don't match." };
  let user;
  try {
    user = await accountService().resetPassword(String(formData.get("token") ?? ""), password);
  } catch (e) {
    return { error: message(e) };
  }
  if (user.disabled) redirect("/login");
  await startSession(user.id);
  redirect(homePath(user));
}

/** "Forgot password?" (D-037). Always the same reply, so it never reveals whether an account exists. */
export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { RESET_HOURS } = await import("@/lib/auth/accounts");
  const { passwordResetEmail } = await import("@/lib/email/templates");
  const { mailService, linkBase } = await import("@/lib/service");
  const email = String(formData.get("email") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the email address you sign in with." };
  const request = accountService().requestPasswordReset(email);
  if (request) {
    const { baseUrl } = await import("@/lib/auth/session");
    const base = await baseUrl().catch(() => linkBase());
    await mailService().send(passwordResetEmail({ to: request.user.email, link: `${base}/reset/${request.token}`, hours: RESET_HOURS, byAdmin: null }));
  }
  return { message: `If there's an Efficio account for ${email}, we've emailed it a link to reset the password. The link expires in ${RESET_HOURS} hours. Nothing arriving? Check spam, or ask your company's Efficio admin.` };
}

export async function setMyEmailAlertsAction(formData: FormData): Promise<void> {
  const { requireUser } = await import("@/lib/auth/session");
  const user = await requireUser();
  accountService().setEmailAlerts(user.id, formData.get("on") === "1");
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/account");
}
