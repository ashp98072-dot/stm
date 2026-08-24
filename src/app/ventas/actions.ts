"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { canCreateSales, getOrganizationContext } from "@/lib/auth/organization";

export type SaleActionState = { message: string };

const saleSchema = z.object({
  customerId: z.string().transform((value) => value || null).pipe(z.uuid().nullable()),
  paymentMethod: z.enum(["cash", "card", "transfer", "store_credit", "other"]),
  amountReceived: z.string().transform((value) => value ? Number(value) : null).pipe(z.number().nonnegative().nullable()),
  discountType: z.enum(["none", "percent", "fixed"]),
  discountValue: z.coerce.number().min(0).max(999999999),
  quoteId: z.string().transform((value) => value || null).pipe(z.uuid().nullable()),
  items: z.string().transform((value, context) => {
    try { return JSON.parse(value) as unknown; }
    catch { context.addIssue({ code: "custom", message: "El carrito no es válido." }); return z.NEVER; }
  }).pipe(z.array(z.object({ product_id: z.uuid(),variant_id:z.uuid().nullable(), quantity: z.number().positive() })).min(1, "Agrega al menos un producto.")),
});

export async function completeSale(
  _state: SaleActionState,
  formData: FormData,
): Promise<SaleActionState> {
  const parsed = saleSchema.safeParse({
    customerId: formData.get("customerId"), paymentMethod: formData.get("paymentMethod"),
    amountReceived: formData.get("amountReceived"), discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"), quoteId: formData.get("quoteId"), items: formData.get("items"),
  });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Datos de venta inválidos." };
  if (parsed.data.paymentMethod === "store_credit" && !parsed.data.customerId) return { message: "Selecciona un cliente para vender al crédito." };

  const context = await getOrganizationContext();
  if (!canCreateSales(context.role)) return { message: "No tienes permiso para realizar ventas." };
  const saleArguments = {
    p_organization_id: context.organization.id,
    p_location_id: context.location.id,
    p_customer_id: parsed.data.customerId,
    p_items: parsed.data.items,
    p_payment_method: parsed.data.paymentMethod,
    p_amount_received: parsed.data.amountReceived,
    p_discount_type: parsed.data.discountType,
    p_discount_value: parsed.data.discountValue,
  };
  const { data, error } = parsed.data.quoteId
    ? await context.supabase.rpc("complete_quoted_sale", { ...saleArguments, p_quote_id: parsed.data.quoteId })
    : await context.supabase.rpc("complete_variant_sale", saleArguments);
  if (error) {
    const detail = error.message.toLowerCase();
    if (detail.includes("insufficient stock")) return { message: "No hay existencia suficiente para uno de los productos." };
    if (detail.includes("insufficient payment")) return { message: "El monto recibido no cubre el total." };
    if (detail.includes("credit limit")) return { message: "La venta supera el límite de crédito disponible del cliente." };
    if (detail.includes("open cash register")) return { message: "Abre tu caja antes de registrar una venta en efectivo." };
    if (detail.includes("quote")) return { message: "La cotización ya no está disponible o no corresponde a esta sucursal y cliente." };
    if (detail.includes("could not find the function")) return { message: "Falta aplicar la migración de ventas en Supabase." };
    return { message: "No se pudo completar la venta. Intenta nuevamente." };
  }
  redirect(`/ventas/recibo/${data}`);
}
