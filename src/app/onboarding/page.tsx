import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrganizationForm } from "./organization-form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (membership) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f5f1] px-6 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-black/8 bg-white p-8 shadow-[0_24px_70px_rgba(24,63,50,0.10)] sm:p-11">
        <div className="grid size-12 place-items-center rounded-xl bg-[#163f32] text-xl font-black text-[#d7f36b]">S</div>
        <p className="mt-9 text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">Configuración inicial</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">Crea tu espacio de trabajo</h1>
        <p className="mt-3 leading-7 text-[#68766f]">Crearemos la empresa y su primera sucursal. Después podrás cargar productos, clientes y ventas.</p>
        <OrganizationForm />
      </section>
    </main>
  );
}
