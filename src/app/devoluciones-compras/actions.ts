"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrganizationContext } from "@/lib/auth/organization";

export async function returnPurchaseItems(formData: FormData) {
  const context = await getOrganizationContext();
  if (!["owner", "admin", "manager", "inventory"].includes(context.role)) redirect("/devoluciones-compras?error=permissions");
  const parsed = z.object({ purchaseId: z.uuid(), reason: z.string().trim().min(3).max(300), resolution: z.enum(["supplier_credit", "cash", "transfer", "other"]), items: z.string().transform((value, ctx) => { try { return JSON.parse(value) as unknown; } catch { ctx.addIssue({ code: "custom", message: "invalid" }); return z.NEVER; } }).pipe(z.array(z.object({ purchase_item_id: z.uuid(), quantity: z.number().positive() })).min(1)) }).safeParse({ purchaseId: formData.get("purchaseId"), reason: formData.get("reason"), resolution: formData.get("resolution"), items: formData.get("items") });
  if (!parsed.success) redirect(`/devoluciones-compras?purchase=${formData.get("purchaseId")}&error=invalid`);
  const { error } = await context.supabase.rpc("return_purchase_items", { p_purchase_id: parsed.data.purchaseId, p_reason: parsed.data.reason, p_resolution: parsed.data.resolution, p_items: parsed.data.items });
  if (error) { const message = error.message.toLowerCase(); redirect(`/devoluciones-compras?purchase=${parsed.data.purchaseId}&error=${message.includes("stock") ? "stock" : message.includes("paid") ? "paid" : message.includes("exceeds") ? "quantity" : "save"}`); }
  revalidatePath("/"); revalidatePath("/inventario"); revalidatePath("/movimientos"); revalidatePath("/cuentas-por-pagar"); revalidatePath("/devoluciones-compras");
  redirect("/devoluciones-compras?saved=1");
}
