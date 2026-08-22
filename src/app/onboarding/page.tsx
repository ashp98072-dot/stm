import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrganizationForm } from "./organization-form";
import { acceptInvitation } from "@/app/equipo/actions";

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
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

  const [{ data: invitations }, params] = await Promise.all([
    supabase.from("organization_invitations").select("id, role, organization:organizations(name)").is("accepted_at", null).order("created_at", { ascending: false }),
    searchParams,
  ]);
  const invitation = invitations?.[0];
  const organizationValue = invitation?.organization as { name?: string } | Array<{ name?: string }> | null;
  const invitedOrganization = Array.isArray(organizationValue) ? organizationValue[0] : organizationValue;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f5f1] px-6 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-black/8 bg-white p-8 shadow-[0_24px_70px_rgba(24,63,50,0.10)] sm:p-11">
        <div className="grid size-12 place-items-center rounded-xl bg-[#163f32] text-xl font-black text-[#d7f36b]">S</div>
        <p className="mt-9 text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">Configuración inicial</p>
        <h1 className="mt-3 text-4xl font-bold tracking-[-0.04em]">Crea tu espacio de trabajo</h1>
        <p className="mt-3 leading-7 text-[#68766f]">Crearemos la empresa y su primera sucursal. Después podrás cargar productos, clientes y ventas.</p>
        {invitation && <form action={acceptInvitation} className="mt-7 rounded-2xl border border-[#b8cbbf] bg-[#eef5ef] p-5"><input type="hidden" name="invitationId" value={invitation.id} /><p className="text-sm font-bold uppercase tracking-wider text-[#517064]">Invitación disponible</p><p className="mt-2 font-bold">{invitedOrganization?.name ?? "Empresa"}</p><p className="mt-1 text-sm text-[#68766f]">Tu cuenta fue invitada con el rol {invitation.role}.</p><button className="mt-4 h-11 w-full rounded-xl bg-[#163f32] font-bold text-white">Unirme a la empresa</button></form>}
        {params.error && <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">La invitación no pudo ser aceptada.</p>}
        <div className="my-7 flex items-center gap-3 text-xs uppercase tracking-wider text-[#8a958f]"><span className="h-px flex-1 bg-black/10" /><span>{invitation ? "o crea otra empresa" : "nueva empresa"}</span><span className="h-px flex-1 bg-black/10" /></div>
        <OrganizationForm />
      </section>
    </main>
  );
}
