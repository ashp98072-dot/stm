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

  const [{ data: organization }, { data: location }] = await Promise.all([
    supabase.from("organizations").select("id, name, currency_code").eq("id", membership.organization_id).single(),
    supabase.from("locations").select("id, name").eq("organization_id", membership.organization_id).eq("active", true).order("created_at").limit(1).single(),
  ]);
  if (!organization || !location) throw new Error("La empresa no tiene una sucursal activa.");

  return {
    supabase,
    user,
    organization,
    location,
    role: membership.role as MembershipRole,
  };
}

export function canManageInventory(role: MembershipRole) {
  return ["owner", "admin", "manager", "inventory"].includes(role);
}

export function canManageCustomers(role: MembershipRole) {
  return ["owner", "admin", "manager", "cashier"].includes(role);
}
