import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type MembershipRole = "owner" | "admin" | "manager" | "cashier" | "inventory" | "viewer";

export async function getOrganizationContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const [{ data: organization }, { data: locations }, { data: profile }] = await Promise.all([
    supabase.from("organizations").select("id, name, currency_code, timezone").eq("id", membership.organization_id).single(),
    supabase.from("locations").select("id, name").eq("organization_id", membership.organization_id).eq("active", true).order("created_at"),
    supabase.from("profiles").select("selected_location_id").eq("id", user.id).single(),
  ]);
  const location = locations?.find((item) => item.id === profile?.selected_location_id) ?? locations?.[0];
  if (!organization || !location) throw new Error("La empresa no tiene una sucursal activa.");

  return {
    supabase,
    user,
    organization,
    location,
    locations: locations ?? [],
    role: membership.role as MembershipRole,
  };
}

export function canManageInventory(role: MembershipRole) {
  return ["owner", "admin", "manager", "inventory"].includes(role);
}

export function canManageCustomers(role: MembershipRole) {
  return ["owner", "admin", "manager", "cashier"].includes(role);
}

export function canCreateSales(role: MembershipRole) {
  return ["owner", "admin", "manager", "cashier"].includes(role);
}

export function canViewReports(role: MembershipRole) {
  return ["owner", "admin", "manager", "viewer"].includes(role);
}

export function canManageExpenses(role: MembershipRole) {
  return ["owner", "admin", "manager"].includes(role);
}

export function canManageTeam(role: MembershipRole) {
  return ["owner", "admin"].includes(role);
}

export function canManageLocations(role: MembershipRole) {
  return ["owner", "admin", "manager"].includes(role);
}
