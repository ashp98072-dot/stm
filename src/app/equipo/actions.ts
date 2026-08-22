"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageTeam, getOrganizationContext, type MembershipRole } from "@/lib/auth/organization";

export type TeamState = { message: string; success?: boolean };

const roles = ["admin", "manager", "cashier", "inventory", "viewer"] as const;
const invitationSchema = z.object({
  email: z.string().trim().toLowerCase().email("Ingresa un correo válido."),
  role: z.enum(roles),
});

export async function inviteMember(_state: TeamState, formData: FormData): Promise<TeamState> {
  const context = await getOrganizationContext();
  if (!canManageTeam(context.role)) return { message: "No tienes permiso para invitar colaboradores." };
  const result = invitationSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!result.success) return { message: result.error.issues[0]?.message ?? "Datos inválidos." };

  const { error } = await context.supabase.rpc("invite_organization_member", {
    target_organization_id: context.organization.id,
    target_email: result.data.email,
    target_role: result.data.role,
  });
  if (error) return { message: "No se pudo crear la invitación. Verifica el correo y el rol." };
  revalidatePath("/equipo");
  return { message: "Invitación preparada correctamente.", success: true };
}

const memberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(roles),
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export async function manageMember(formData: FormData) {
  const context = await getOrganizationContext();
  if (!canManageTeam(context.role)) redirect("/");
  const result = memberSchema.safeParse({ userId: formData.get("userId"), role: formData.get("role"), active: formData.get("active") });
  if (!result.success) redirect("/equipo?error=invalid");

  const { error } = await context.supabase.rpc("manage_organization_member", {
    target_organization_id: context.organization.id,
    target_user_id: result.data.userId,
    target_role: result.data.role as MembershipRole,
    target_active: result.data.active,
  });
  if (error) redirect("/equipo?error=permissions");
  revalidatePath("/equipo");
  redirect("/equipo?updated=1");
}

export async function acceptInvitation(formData: FormData) {
  const invitationId = z.string().uuid().safeParse(formData.get("invitationId"));
  if (!invitationId.success) redirect("/onboarding?error=invitation");
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_organization_invitation", { invitation_id: invitationId.data });
  if (error) redirect("/onboarding?error=invitation");
  redirect("/");
}
