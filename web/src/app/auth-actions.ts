"use server";

import { redirect } from "next/navigation";
import { AccountError } from "@/lib/auth/accounts";
import { endSession, homePath, startSession } from "@/lib/auth/session";
import { accountService } from "@/lib/service";
import type { FormState } from "./ActionForm";

function message(e: unknown): string {
  if (e instanceof AccountError) return e.message;
  console.error(e);
  return "Something went wrong. Please try again.";
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await accountService().authenticate(String(formData.get("email") ?? ""), String(formData.get("password") ?? ""));
  if (!user) return { error: "That email and password don't match an active account." };
  await startSession(user.id);
  redirect(homePath(user));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
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
