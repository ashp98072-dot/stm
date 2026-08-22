"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrganizationContext } from "@/lib/auth/organization";

export async function updateDueDate(formData: FormData) {
  const context = await getOrganizationContext();
  if (!["owner", "admin", "manager"].includes(context.role)) redirect("/vencimientos?error=permissions");
  const parsed = z.object({
    type: z.enum(["customer", "supplier"]),
    movementId: z.uuid(),
    dueDate: z.iso.date(),
  }).safeParse({
    type: formData.get("type"),
    movementId: formData.get("movementId"),
    dueDate: formData.get("dueDate"),
  });
  if (!parsed.success) redirect("/vencimientos?error=invalid");
  const { error } = await context.supabase.rpc("update_document_due_date", {
    p_document_type: parsed.data.type,
    p_movement_id: parsed.data.movementId,
    p_due_date: parsed.data.dueDate,
  });
  if (error) redirect("/vencimientos?error=save");
  revalidatePath("/alertas");
  revalidatePath("/antiguedad");
  revalidatePath("/vencimientos");
  redirect("/vencimientos?saved=1");
}
