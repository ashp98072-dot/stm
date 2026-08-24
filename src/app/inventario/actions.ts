"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageInventory, getOrganizationContext } from "@/lib/auth/organization";

export type InventoryActionState = { message: string; success?: boolean };

const optionalCode = z.string().trim().max(80).transform((value) => value || null);
const productSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(160),
  category: z.string().trim().max(100).transform((value) => value || null),
  sku: optionalCode,
  barcode: optionalCode,
  cost: z.coerce.number().min(0, "El costo no puede ser negativo."),
  price: z.coerce.number().min(0, "El precio no puede ser negativo."),
  taxRate: z.coerce.number().min(0).max(100),
  quantity: z.coerce.number().min(0, "El inventario inicial no puede ser negativo."),
  reorderPoint: z.coerce.number().min(0),
});
const productDetailsSchema = productSchema.omit({ quantity: true, reorderPoint: true });

export async function createProduct(
  _state: InventoryActionState,
  formData: FormData,
): Promise<InventoryActionState> {
  const parsed = productSchema.safeParse({
    name: formData.get("name"), category: formData.get("category"), sku: formData.get("sku"),
    barcode: formData.get("barcode"), cost: formData.get("cost"), price: formData.get("price"),
    taxRate: formData.get("taxRate"), quantity: formData.get("quantity"), reorderPoint: formData.get("reorderPoint"),
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const context = await getOrganizationContext();
  if (!canManageInventory(context.role)) return { message: "No tienes permiso para crear productos." };
  const { error } = await context.supabase.rpc("create_inventory_product", {
    p_organization_id: context.organization.id,
    p_location_id: context.location.id,
    p_name: parsed.data.name,
    p_category_name: parsed.data.category,
    p_sku: parsed.data.sku,
    p_barcode: parsed.data.barcode,
    p_cost: parsed.data.cost,
    p_price: parsed.data.price,
    p_tax_rate: parsed.data.taxRate / 100,
    p_quantity: parsed.data.quantity,
    p_reorder_point: parsed.data.reorderPoint,
  });
  if (error) {
    if (error.code === "23505") return { message: "El SKU, código de barras o categoría ya está registrado." };
    if (error.message.toLowerCase().includes("could not find")) return { message: "Falta aplicar la migración de creación de productos." };
    return { message: "No se pudo guardar el producto ni su inventario." };
  }
  revalidatePath("/");
  revalidatePath("/inventario");
  return { message: "Producto creado correctamente.", success: true };
}

const stockSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number().min(0),
  reorderPoint: z.coerce.number().min(0),
  reason: z.enum(["count", "damage", "shrinkage", "correction", "other"]),
});

export async function updateStock(formData: FormData) {
  const parsed = stockSchema.safeParse({ productId: formData.get("productId"), quantity: formData.get("quantity"), reorderPoint: formData.get("reorderPoint"), reason: formData.get("reason") });
  if (!parsed.success) redirect("/inventario?error=invalid-stock");
  const context = await getOrganizationContext();
  if (!canManageInventory(context.role)) redirect("/inventario?error=permissions");
  const { error } = await context.supabase.rpc("adjust_inventory_stock", {
    p_organization_id: context.organization.id,
    p_location_id: context.location.id,
    p_product_id: parsed.data.productId,
    p_quantity: parsed.data.quantity,
    p_reorder_point: parsed.data.reorderPoint,
    p_reason: ({ count: "Conteo físico", damage: "Producto dañado", shrinkage: "Merma de inventario", correction: "Corrección de registro", other: "Otro ajuste manual" })[parsed.data.reason],
  });
  if (error) redirect("/inventario?error=stock");
  revalidatePath("/");
  revalidatePath("/inventario");
  redirect("/inventario?stock=updated");
}

export async function updateProduct(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("productId"));
  const parsed = productDetailsSchema.safeParse({
    name: formData.get("name"), category: formData.get("category"), sku: formData.get("sku"),
    barcode: formData.get("barcode"), cost: formData.get("cost"), price: formData.get("price"),
    taxRate: formData.get("taxRate"),
  });
  if (!id.success || !parsed.success) redirect("/inventario?error=invalid-product");
  const context = await getOrganizationContext();
  if (!canManageInventory(context.role)) redirect("/inventario?error=permissions");
  const { error } = await context.supabase.rpc("update_inventory_product", {
    p_product_id: id.data, p_organization_id: context.organization.id,
    p_name: parsed.data.name, p_category_name: parsed.data.category,
    p_sku: parsed.data.sku, p_barcode: parsed.data.barcode,
    p_cost: parsed.data.cost, p_price: parsed.data.price,
    p_tax_rate: parsed.data.taxRate / 100,
  });
  if (error) redirect(`/inventario?error=${error.code === "23505" ? "duplicate-product" : "product"}`);
  revalidatePath("/inventario");
  revalidatePath("/ventas");
  redirect("/inventario?product=updated");
}

export async function deactivateProduct(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("productId"));
  if (!id.success) redirect("/inventario?error=invalid-product");
  const context = await getOrganizationContext();
  if (!canManageInventory(context.role)) redirect("/inventario?error=permissions");
  const { error } = await context.supabase.rpc("deactivate_inventory_product", {
    p_product_id: id.data, p_organization_id: context.organization.id,
  });
  if (error) redirect("/inventario?error=deactivate");
  revalidatePath("/");
  revalidatePath("/inventario");
  revalidatePath("/ventas");
  redirect("/inventario?product=deactivated");
}
