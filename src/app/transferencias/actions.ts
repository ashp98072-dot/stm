"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageInventory, getOrganizationContext } from "@/lib/auth/organization";

const transferSchema = z.object({
  sourceLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  reference: z.string().trim().max(100),
  notes: z.string().trim().max(500),
  items: z.array(z.object({ product_id: z.string().uuid(),variant_id:z.string().uuid().nullable(), quantity: z.number().positive() })).min(1).max(100),
}).refine((value) => value.sourceLocationId !== value.destinationLocationId, "Las sucursales deben ser diferentes.");

export type TransferState = { message: string };

export async function createTransfer(_state: TransferState, formData: FormData): Promise<TransferState> {
  const context = await getOrganizationContext();
  if (!canManageInventory(context.role)) return { message: "No tienes permiso para transferir inventario." };
  let items: unknown = [];
  try { items = JSON.parse(String(formData.get("items") ?? "[]")); } catch { return { message: "Los productos enviados no son válidos." }; }
  const result = transferSchema.safeParse({ sourceLocationId: formData.get("sourceLocationId"), destinationLocationId: formData.get("destinationLocationId"), reference: formData.get("reference"), notes: formData.get("notes"), items });
  if (!result.success) return { message: result.error.issues[0]?.message ?? "Datos inválidos." };
  const { data, error } = await context.supabase.rpc("transfer_inventory", { p_organization_id: context.organization.id, p_source_location_id: result.data.sourceLocationId, p_destination_location_id: result.data.destinationLocationId, p_reference: result.data.reference, p_notes: result.data.notes, p_items: result.data.items });
  if (error) return { message: error.message.includes("insufficient stock") ? "No hay existencias suficientes para completar la transferencia." : "No se pudo completar la transferencia." };
  redirect(`/transferencias?completed=${data}`);
}
