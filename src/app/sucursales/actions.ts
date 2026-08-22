"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageLocations, getOrganizationContext } from "@/lib/auth/organization";

const locationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(30),
});

export async function selectLocation(formData: FormData) {
  const context = await getOrganizationContext();
  const locationId = z.string().uuid().safeParse(formData.get("locationId"));
  if (!locationId.success || !context.locations.some((location) => location.id === locationId.data)) redirect("/sucursales?error=location");
  const { error } = await context.supabase.rpc("select_location", { target_location_id: locationId.data });
  if (error) redirect("/sucursales?error=location");
  revalidatePath("/", "layout");
  redirect("/sucursales?selected=1");
}

export async function createLocation(formData: FormData) {
  const context = await getOrganizationContext();
  if (!canManageLocations(context.role)) redirect("/");
  const result = locationSchema.safeParse({ name: formData.get("name"), address: formData.get("address"), phone: formData.get("phone") });
  if (!result.success) redirect("/sucursales?error=invalid");
  const { error } = await context.supabase.rpc("create_location", { target_organization_id: context.organization.id, location_name: result.data.name, location_address: result.data.address, location_phone: result.data.phone });
  if (error) redirect("/sucursales?error=duplicate");
  revalidatePath("/sucursales");
  redirect("/sucursales?created=1");
}

export async function updateLocation(formData: FormData) {
  const context = await getOrganizationContext();
  if (!canManageLocations(context.role)) redirect("/");
  const locationId = z.string().uuid().safeParse(formData.get("locationId"));
  const result = locationSchema.safeParse({ name: formData.get("name"), address: formData.get("address"), phone: formData.get("phone") });
  const active = formData.get("active") === "true";
  if (!locationId.success || !result.success) redirect("/sucursales?error=invalid");
  const { error } = await context.supabase.rpc("update_location", { target_location_id: locationId.data, location_name: result.data.name, location_address: result.data.address, location_phone: result.data.phone, target_active: active });
  if (error) redirect("/sucursales?error=last");
  revalidatePath("/", "layout");
  redirect("/sucursales?updated=1");
}
