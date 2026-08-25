"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  canManageCustomers,
  getOrganizationContext,
} from "@/lib/auth/organization";

export type QuoteState = { message: string };
export async function createQuote(
  _state: QuoteState,
  formData: FormData,
): Promise<QuoteState> {
  const context = await getOrganizationContext();
  if (!canManageCustomers(context.role))
    return { message: "No tienes permiso para crear cotizaciones." };
  const schema = z.object({
    customerId: z
      .string()
      .transform((v) => v || null)
      .pipe(z.uuid().nullable()),
    validUntil: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    notes: z.string().trim().max(500),
    items: z
      .string()
      .transform((v, c) => {
        try {
          return JSON.parse(v) as unknown;
        } catch {
          c.addIssue({ code: "custom", message: "Productos inválidos" });
          return z.NEVER;
        }
      })
      .pipe(
        z
          .array(
            z.object({ product_id: z.uuid(), variant_id: z.uuid().nullable().optional(), quantity: z.number().positive() }),
          )
          .min(1),
      ),
  });
  const parsed = schema.safeParse({
    customerId: formData.get("customerId"),
    validUntil: formData.get("validUntil") || null,
    notes: formData.get("notes"),
    items: formData.get("items"),
  });
  if (!parsed.success)
    return { message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { data, error } = await context.supabase.rpc("create_quote", {
    p_organization_id: context.organization.id,
    p_location_id: context.location.id,
    p_customer_id: parsed.data.customerId,
    p_valid_until: parsed.data.validUntil,
    p_notes: parsed.data.notes,
    p_items: parsed.data.items,
  });
  if (error) return { message: "No se pudo crear la cotización." };
  redirect(`/cotizaciones/${data}`);
}
export async function cancelQuote(formData: FormData) {
  const context = await getOrganizationContext();
  const id = z.string().uuid().safeParse(formData.get("quoteId"));
  if (!id.success) redirect("/cotizaciones?error=invalid");
  const { error } = await context.supabase.rpc("cancel_quote", {
    p_quote_id: id.data,
  });
  if (error) redirect(`/cotizaciones/${id.data}?error=cancel`);
  redirect(`/cotizaciones/${id.data}?cancelled=1`);
}
