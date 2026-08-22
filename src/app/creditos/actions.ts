"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageCustomers, getOrganizationContext } from "@/lib/auth/organization";

export async function recordPayment(formData: FormData) {
  const context = await getOrganizationContext();
  if (!canManageCustomers(context.role)) redirect("/");
  const parsed = z.object({ customerId: z.string().uuid(), amount: z.coerce.number().positive(), method: z.enum(["cash","card","transfer","other"]), reference: z.string().trim().max(100), notes: z.string().trim().max(300) }).safeParse({ customerId: formData.get("customerId"), amount: formData.get("amount"), method: formData.get("method"), reference: formData.get("reference"), notes: formData.get("notes") });
  if (!parsed.success) redirect("/creditos?error=invalid");
  const { error } = await context.supabase.rpc("record_customer_payment", { p_customer_id: parsed.data.customerId, p_location_id: context.location.id, p_amount: parsed.data.amount, p_method: parsed.data.method, p_reference: parsed.data.reference, p_notes: parsed.data.notes });
  if (error) redirect("/creditos?error=balance");
  redirect("/creditos?paid=1");
}
