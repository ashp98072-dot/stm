"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrganizationContext } from "@/lib/auth/organization";

const optional = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const organizationSchema = z.object({
  name: z.string().trim().min(2).max(100), currency: z.enum(["GTQ","USD","MXN"]),
  timezone: z.enum(["America/Guatemala","America/Mexico_City","America/New_York","UTC"]),
  taxId: optional(50), address: optional(300), phone: optional(30),
  email: z.string().trim().max(254).refine((value) => !value || z.email().safeParse(value).success, "Correo inválido").transform((value) => value || null),
  receiptFooter: z.string().trim().min(2).max(300),
  customerCreditDays: z.coerce.number().int().min(1).max(365),
  supplierCreditDays: z.coerce.number().int().min(1).max(365),
});

export async function updateOrganization(formData: FormData) {
  const context = await getOrganizationContext();
  if (!["owner","admin"].includes(context.role)) redirect("/configuracion?error=permissions");
  const parsed = organizationSchema.safeParse({ name: formData.get("name"), currency: formData.get("currency"), timezone: formData.get("timezone"), taxId: formData.get("taxId"), address: formData.get("address"), phone: formData.get("phone"), email: formData.get("email"), receiptFooter: formData.get("receiptFooter"), customerCreditDays: formData.get("customerCreditDays"), supplierCreditDays: formData.get("supplierCreditDays") });
  if (!parsed.success) redirect("/configuracion?error=invalid");
  const { error } = await context.supabase.from("organizations").update({ name: parsed.data.name, currency_code: parsed.data.currency, timezone: parsed.data.timezone, tax_id: parsed.data.taxId, address: parsed.data.address, phone: parsed.data.phone, email: parsed.data.email, receipt_footer: parsed.data.receiptFooter, customer_credit_days: parsed.data.customerCreditDays, supplier_credit_days: parsed.data.supplierCreditDays }).eq("id", context.organization.id);
  if (error) redirect("/configuracion?error=save");
  revalidatePath("/", "layout");
  redirect("/configuracion?saved=organization");
}

export async function updateProfile(formData: FormData) {
  const context = await getOrganizationContext();
  const parsed = z.object({ fullName: z.string().trim().min(2).max(100), phone: optional(30) }).safeParse({ fullName: formData.get("fullName"), phone: formData.get("profilePhone") });
  if (!parsed.success) redirect("/configuracion?error=profile");
  const { error } = await context.supabase.from("profiles").update({ full_name: parsed.data.fullName, phone: parsed.data.phone }).eq("id", context.user.id);
  if (error) redirect("/configuracion?error=profile");
  revalidatePath("/configuracion");
  redirect("/configuracion?saved=profile");
}
