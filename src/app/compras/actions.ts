"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageInventory, getOrganizationContext } from "@/lib/auth/organization";

export type PurchaseState = { message: string; success?: boolean };
const optional = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const supplierSchema = z.object({
  name: z.string().trim().min(2, "Ingresa el nombre del proveedor.").max(160),
  contactName: optional(120), email: optional(254), phone: optional(40), taxId: optional(40), address: optional(300),
});

export async function createSupplier(_state: PurchaseState, formData: FormData): Promise<PurchaseState> {
  const parsed = supplierSchema.safeParse({ name: formData.get("name"), contactName: formData.get("contactName"), email: formData.get("email"), phone: formData.get("phone"), taxId: formData.get("taxId"), address: formData.get("address") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const context = await getOrganizationContext();
  if (!canManageInventory(context.role)) return { message: "No tienes permiso para administrar proveedores." };
  const { error } = await context.supabase.from("suppliers").insert({ organization_id: context.organization.id, name: parsed.data.name, contact_name: parsed.data.contactName, email: parsed.data.email, phone: parsed.data.phone, tax_id: parsed.data.taxId, address: parsed.data.address });
  if (error) return { message: error.code === "PGRST205" ? "Falta aplicar la migración de compras." : "No se pudo guardar el proveedor." };
  revalidatePath("/compras");
  return { message: "Proveedor creado correctamente.", success: true };
}

const purchaseSchema = z.object({
  supplierId: z.string().transform((value) => value || null).pipe(z.uuid().nullable()),
  reference: z.string().trim().max(100),
  paymentTerms: z.enum(["cash", "credit"]),
  items: z.string().transform((value, context) => { try { return JSON.parse(value) as unknown; } catch { context.addIssue({ code: "custom", message: "La recepción no es válida." }); return z.NEVER; } })
    .pipe(z.array(z.object({ product_id: z.uuid(), quantity: z.number().positive(), unit_cost: z.number().nonnegative() })).min(1)),
});

export async function receivePurchase(_state: PurchaseState, formData: FormData): Promise<PurchaseState> {
  const parsed = purchaseSchema.safeParse({ supplierId: formData.get("supplierId"), reference: formData.get("reference"), paymentTerms: formData.get("paymentTerms"), items: formData.get("items") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Recepción inválida." };
  const context = await getOrganizationContext();
  if (!canManageInventory(context.role)) return { message: "No tienes permiso para recibir inventario." };
  if (parsed.data.paymentTerms === "credit" && !parsed.data.supplierId) return { message: "Selecciona un proveedor para comprar al crédito." };
  const { data, error } = await context.supabase.rpc("receive_purchase", { p_organization_id: context.organization.id, p_location_id: context.location.id, p_supplier_id: parsed.data.supplierId, p_reference: parsed.data.reference, p_payment_terms: parsed.data.paymentTerms, p_items: parsed.data.items });
  if (error) return { message: error.message.toLowerCase().includes("could not find") ? "Falta aplicar la migración de compras en Supabase." : "No se pudo completar la recepción." };
  revalidatePath("/"); revalidatePath("/inventario"); revalidatePath("/compras");
  redirect(`/compras?received=${data}`);
}
