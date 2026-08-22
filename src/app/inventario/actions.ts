"use server";

import { revalidatePath } from "next/cache";
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
  quantity: z.coerce.number(),
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
  const { supabase, organization, location, user } = context;

  let categoryId: string | null = null;
  if (parsed.data.category) {
    const { data: existing } = await supabase.from("categories").select("id").eq("organization_id", organization.id).ilike("name", parsed.data.category).limit(1).maybeSingle();
    if (existing) categoryId = existing.id;
    else {
      const { data: created, error } = await supabase.from("categories").insert({ organization_id: organization.id, name: parsed.data.category }).select("id").single();
      if (error) return { message: "No se pudo crear la categoría." };
      categoryId = created.id;
    }
  }

  const { data: product, error: productError } = await supabase.from("products").insert({
    organization_id: organization.id, category_id: categoryId, name: parsed.data.name,
    sku: parsed.data.sku, barcode: parsed.data.barcode, cost: parsed.data.cost, price: parsed.data.price,
    tax_rate: parsed.data.taxRate / 100, track_inventory: true,
  }).select("id").single();
  if (productError) {
    if (productError.code === "23505") return { message: "El SKU o código de barras ya está registrado." };
    return { message: "No se pudo guardar el producto." };
  }

  const { error: inventoryError } = await supabase.from("inventory_levels").insert({
    organization_id: organization.id, location_id: location.id, product_id: product.id,
    quantity: parsed.data.quantity, reorder_point: parsed.data.reorderPoint,
  });
  if (inventoryError) return { message: "Producto creado, pero no se pudo establecer su inventario." };

  if (parsed.data.quantity !== 0) {
    await supabase.from("inventory_movements").insert({
      organization_id: organization.id, location_id: location.id, product_id: product.id,
      quantity_delta: parsed.data.quantity, reason: "Inventario inicial", performed_by: user.id,
    });
  }
  revalidatePath("/");
  revalidatePath("/inventario");
  return { message: "Producto creado correctamente.", success: true };
}

const stockSchema = z.object({
  productId: z.uuid(),
  quantity: z.coerce.number(),
  reorderPoint: z.coerce.number().min(0),
});

export async function updateStock(formData: FormData) {
  const parsed = stockSchema.safeParse({ productId: formData.get("productId"), quantity: formData.get("quantity"), reorderPoint: formData.get("reorderPoint") });
  if (!parsed.success) return;
  const context = await getOrganizationContext();
  if (!canManageInventory(context.role)) return;
  const { supabase, organization, location, user } = context;

  const { data: current } = await supabase.from("inventory_levels").select("quantity").eq("organization_id", organization.id).eq("location_id", location.id).eq("product_id", parsed.data.productId).maybeSingle();
  const previous = Number(current?.quantity ?? 0);
  const delta = parsed.data.quantity - previous;
  await supabase.from("inventory_levels").upsert({
    organization_id: organization.id, location_id: location.id, product_id: parsed.data.productId,
    quantity: parsed.data.quantity, reorder_point: parsed.data.reorderPoint,
  }, { onConflict: "location_id,product_id" });
  if (delta !== 0) await supabase.from("inventory_movements").insert({
    organization_id: organization.id, location_id: location.id, product_id: parsed.data.productId,
    quantity_delta: delta, reason: "Ajuste manual", performed_by: user.id,
  });
  revalidatePath("/");
  revalidatePath("/inventario");
}

export async function updateProduct(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("productId"));
  const parsed = productDetailsSchema.safeParse({
    name: formData.get("name"), category: formData.get("category"), sku: formData.get("sku"),
    barcode: formData.get("barcode"), cost: formData.get("cost"), price: formData.get("price"),
    taxRate: formData.get("taxRate"),
  });
  if (!id.success || !parsed.success) return;
  const context = await getOrganizationContext();
  if (!canManageInventory(context.role)) return;

  let categoryId: string | null = null;
  if (parsed.data.category) {
    const { data: existing } = await context.supabase.from("categories").select("id")
      .eq("organization_id", context.organization.id).ilike("name", parsed.data.category).limit(1).maybeSingle();
    if (existing) categoryId = existing.id;
    else {
      const { data: created } = await context.supabase.from("categories").insert({ organization_id: context.organization.id, name: parsed.data.category }).select("id").single();
      categoryId = created?.id ?? null;
    }
  }
  await context.supabase.from("products").update({
    name: parsed.data.name, category_id: categoryId, sku: parsed.data.sku, barcode: parsed.data.barcode,
    cost: parsed.data.cost, price: parsed.data.price, tax_rate: parsed.data.taxRate / 100,
  }).eq("id", id.data).eq("organization_id", context.organization.id);
  revalidatePath("/inventario");
  revalidatePath("/ventas");
}

export async function deactivateProduct(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("productId"));
  if (!id.success) return;
  const context = await getOrganizationContext();
  if (!canManageInventory(context.role)) return;
  await context.supabase.from("products").update({ active: false })
    .eq("id", id.data).eq("organization_id", context.organization.id);
  revalidatePath("/");
  revalidatePath("/inventario");
  revalidatePath("/ventas");
}
