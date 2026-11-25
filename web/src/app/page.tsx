import { redirect } from "next/navigation";
import { getCurrentUser, homePath } from "@/lib/auth/session";
import { accountService } from "@/lib/service";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!accountService().hasAnyUser()) redirect("/setup");
  const user = await getCurrentUser();
  redirect(user ? homePath(user) : "/login");
}
