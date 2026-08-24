"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  canManageExpenses,
  getOrganizationContext,
} from "@/lib/auth/organization";

export type ExpenseState = { message: string; success?: boolean };
const expenseSchema = z.object({
  description: z.string().trim().min(2, "Ingresa una descripción.").max(300),
  category: z.string().trim().min(2, "Ingresa una categoría.").max(100),
  reference: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || null),
  amount: z.coerce.number().positive("El monto debe ser mayor que cero."),
  taxAmount: z.coerce.number().min(0),
  paymentMethod: z.enum(["cash", "card", "transfer", "store_credit", "other"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function createExpense(
  _state: ExpenseState,
  formData: FormData,
): Promise<ExpenseState> {
  const parsed = expenseSchema.safeParse({
    description: formData.get("description"),
    category: formData.get("category"),
    reference: formData.get("reference"),
    amount: formData.get("amount"),
    taxAmount: formData.get("taxAmount"),
    paymentMethod: formData.get("paymentMethod"),
    date: formData.get("date"),
  });
  if (!parsed.success)
    return { message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const context = await getOrganizationContext();
  if (!canManageExpenses(context.role))
    return { message: "No tienes permiso para registrar gastos." };

  let categoryId: string | null = null;
  const { data: existing } = await context.supabase
    .from("expense_categories")
    .select("id")
    .eq("organization_id", context.organization.id)
    .ilike("name", parsed.data.category)
    .limit(1)
    .maybeSingle();
  if (existing) categoryId = existing.id;
  else {
    const { data: created, error } = await context.supabase
      .from("expense_categories")
      .insert({
        organization_id: context.organization.id,
        name: parsed.data.category,
      })
      .select("id")
      .single();
    if (error)
      return {
        message:
          error.code === "PGRST205"
            ? "Falta aplicar la migración de gastos."
            : "No se pudo crear la categoría.",
      };
    categoryId = created.id;
  }
  const { error } = await context.supabase
    .from("expenses")
    .insert({
      organization_id: context.organization.id,
      location_id: context.location.id,
      category_id: categoryId,
      created_by: context.user.id,
      description: parsed.data.description,
      reference: parsed.data.reference,
      amount: parsed.data.amount,
      tax_amount: parsed.data.taxAmount,
      payment_method: parsed.data.paymentMethod,
      incurred_at: `${parsed.data.date}T12:00:00-06:00`,
    });
  if (error) return { message: error.message.toLowerCase().includes("open cash register") ? "Abre tu caja antes de registrar un gasto en efectivo." : "No se pudo guardar el gasto." };
  revalidatePath("/gastos");
  revalidatePath("/reportes");
  return { message: "Gasto registrado correctamente.", success: true };
}

export async function voidExpense(formData: FormData) {
  const id = z.uuid().safeParse(formData.get("expenseId"));
  if (!id.success) redirect("/gastos?error=invalid");
  const context = await getOrganizationContext();
  if (!canManageExpenses(context.role)) redirect("/gastos?error=permissions");
  const { data, error } = await context.supabase
    .from("expenses")
    .update({
      status: "voided",
      voided_at: new Date().toISOString(),
      voided_by: context.user.id,
    })
    .eq("id", id.data)
    .eq("organization_id", context.organization.id)
    .eq("location_id", context.location.id)
    .eq("status", "posted")
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`/gastos?error=${error?.message.toLowerCase().includes("open cash register") ? "register" : "void"}`);
  revalidatePath("/gastos");
  revalidatePath("/reportes");
  redirect("/gastos?voided=1");
}
