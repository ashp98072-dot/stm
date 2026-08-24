"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrganizationContext } from "@/lib/auth/organization";

const schema = z.object({ saleId: z.string().uuid(), reason: z.string().trim().min(3).max(300) });

export async function voidSale(formData: FormData) {
  const context = await getOrganizationContext();
  const result = schema.safeParse({ saleId: formData.get("saleId"), reason: formData.get("reason") });
  if (!result.success) redirect(`/ventas/recibo/${formData.get("saleId")}?error=reason`);
  const { error } = await context.supabase.rpc("void_sale", { p_sale_id: result.data.saleId, p_reason: result.data.reason });
  if (error) redirect(`/ventas/recibo/${result.data.saleId}?error=${error.message.toLowerCase().includes("requires return") ? "return" : "void"}`);
  redirect(`/ventas/recibo/${result.data.saleId}?voided=1`);
}
