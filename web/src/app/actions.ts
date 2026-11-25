"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bookingService } from "@/lib/service";

export interface AddBookingState {
  error: string | null;
}

export async function addBookingAction(_prev: AddBookingState, formData: FormData): Promise<AddBookingState> {
  const input = String(formData.get("bookingNumber") ?? "");
  let id: number;
  try {
    ({ id } = await bookingService().add(input));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not add booking." };
  }
  revalidatePath("/");
  redirect(`/bookings/${id}`);
}

export async function refreshBookingAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  await bookingService().refresh(id);
  revalidatePath(`/bookings/${id}`);
  revalidatePath("/");
}

export async function refreshAllAction(): Promise<void> {
  await bookingService().refreshAll();
  revalidatePath("/");
}

export async function removeBookingAction(formData: FormData): Promise<void> {
  bookingService().remove(Number(formData.get("id")));
  revalidatePath("/");
  redirect("/");
}
