"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type OnboardingState = { message: string };

const organizationSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(100),
});

export async function createOrganization(
  _state: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const result = organizationSchema.safeParse({ name: formData.get("name") });
  if (!result.success) return { message: result.error.issues[0]?.message ?? "Nombre inválido." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.rpc("create_organization", {
    organization_name: result.data.name,
  });
  if (error) return { message: "No se pudo crear la empresa. Intenta nuevamente." };
  redirect("/");
}
