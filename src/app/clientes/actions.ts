"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManageCustomers, getOrganizationContext } from "@/lib/auth/organization";

export type CustomerActionState = { message: string; success?: boolean };

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const customerSchema = z.object({
  firstName: z.string().trim().min(1, "Ingresa el nombre.").max(100),
  lastName: z.string().trim().max(100),
  companyName: optionalText(160),
  email: z.string().trim().max(254).refine((value) => !value || z.email().safeParse(value).success, "El correo no es válido.").transform((value) => value || null),
  phone: optionalText(40),
  taxId: optionalText(40),
  address: optionalText(300),
  notes: optionalText(1000),
});

function parseCustomer(formData: FormData) {
  return customerSchema.safeParse({
    firstName: formData.get("firstName"), lastName: formData.get("lastName"),
    companyName: formData.get("companyName"), email: formData.get("email"),
    phone: formData.get("phone"), taxId: formData.get("taxId"),
    address: formData.get("address"), notes: formData.get("notes"),
  });
}

export async function createCustomer(
  _state: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = parseCustomer(formData);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const context = await getOrganizationContext();
  if (!canManageCustomers(context.role)) return { message: "No tienes permiso para crear clientes." };

  const { error } = await context.supabase.from("customers").insert({
    organization_id: context.organization.id,
    first_name: parsed.data.firstName, last_name: parsed.data.lastName,
    company_name: parsed.data.companyName, email: parsed.data.email,
    phone: parsed.data.phone, tax_id: parsed.data.taxId,
    address: parsed.data.address, notes: parsed.data.notes,
  });
  if (error) return { message: "No se pudo guardar el cliente." };
  revalidatePath("/");
  revalidatePath("/clientes");
  return { message: "Cliente creado correctamente.", success: true };
}

const customerIdSchema = z.uuid();

export async function updateCustomer(formData: FormData) {
  const id = customerIdSchema.safeParse(formData.get("customerId"));
  const parsed = parseCustomer(formData);
  if (!id.success || !parsed.success) return;
  const context = await getOrganizationContext();
  if (!canManageCustomers(context.role)) return;

  await context.supabase.from("customers").update({
    first_name: parsed.data.firstName, last_name: parsed.data.lastName,
    company_name: parsed.data.companyName, email: parsed.data.email,
    phone: parsed.data.phone, tax_id: parsed.data.taxId,
    address: parsed.data.address, notes: parsed.data.notes,
  }).eq("id", id.data).eq("organization_id", context.organization.id);
  revalidatePath("/clientes");
}

export async function deactivateCustomer(formData: FormData) {
  const id = customerIdSchema.safeParse(formData.get("customerId"));
  if (!id.success) return;
  const context = await getOrganizationContext();
  if (!canManageCustomers(context.role)) return;
  await context.supabase.from("customers").update({ active: false }).eq("id", id.data).eq("organization_id", context.organization.id);
  revalidatePath("/");
  revalidatePath("/clientes");
}
