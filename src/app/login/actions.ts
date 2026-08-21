"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { message: string };

const credentialsSchema = z.object({
  identifier: z.string().trim().min(2, "Ingresa tu usuario o correo.").max(254),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
});

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const result = credentialsSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!result.success) return { message: result.error.issues[0]?.message ?? "Datos inválidos." };

  const normalizedIdentifier = result.data.identifier.toLowerCase();
  const email = normalizedIdentifier.includes("@")
    ? normalizedIdentifier
    : `${normalizedIdentifier}@stm.internal`;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: result.data.password });
  if (error) return { message: "Usuario o contraseña incorrectos." };
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
