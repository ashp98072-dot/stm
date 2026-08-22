import Link from "next/link";
import { ArrowLeft, ShieldCheck, UserPlus, Users } from "lucide-react";
import { canManageTeam, getOrganizationContext, type MembershipRole } from "@/lib/auth/organization";
import { InvitationForm } from "./invitation-form";
import { manageMember } from "./actions";

const roleLabels: Record<MembershipRole, string> = { owner: "Propietario", admin: "Administrador", manager: "Gerente", cashier: "Cajero", inventory: "Inventario", viewer: "Solo lectura" };

export default async function TeamPage({ searchParams }: PageProps<"/equipo">) {
  const context = await getOrganizationContext();
  if (!canManageTeam(context.role)) return <main className="grid min-h-screen place-items-center bg-[#f4f5f1] p-6"><div className="max-w-md rounded-2xl bg-white p-8 text-center"><ShieldCheck className="mx-auto text-[#39705b]" /><h1 className="mt-4 text-2xl font-bold">Acceso restringido</h1><p className="mt-2 text-[#68766f]">Solo propietarios y administradores pueden gestionar el equipo.</p><Link href="/" className="mt-6 inline-block font-bold text-[#285645]">Volver al panel</Link></div></main>;
  const params = await searchParams;
  const [{ data: members }, { data: invitations }] = await Promise.all([
    context.supabase.from("organization_members").select("user_id, role, active, created_at").eq("organization_id", context.organization.id).order("created_at"),
    context.supabase.from("organization_invitations").select("id, email, role, created_at").eq("organization_id", context.organization.id).is("accepted_at", null).order("created_at", { ascending: false }),
  ]);
  const { data: profiles } = members?.length
    ? await context.supabase.from("profiles").select("id, full_name").in("id", members.map((member) => member.user_id))
    : { data: [] };
  const profileNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
    <header className="border-b border-black/10 bg-white"><div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-5 lg:px-10"><Link href="/" className="grid size-10 place-items-center rounded-full border border-black/10"><ArrowLeft size={18} /></Link><div><p className="text-sm text-[#68766f]">{context.organization.name}</p><h1 className="text-xl font-bold">Equipo y permisos</h1></div></div></header>
    <div className="mx-auto grid max-w-7xl gap-6 px-6 py-9 lg:grid-cols-[1fr_340px] lg:px-10">
      <section><div className="mb-5 flex items-end justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">Administración</p><h2 className="mt-2 text-3xl font-bold">Colaboradores</h2></div><span className="rounded-full bg-white px-3 py-1 text-sm font-semibold">{members?.length ?? 0} usuarios</span></div>
        {params.updated && <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">El acceso del colaborador fue actualizado.</p>}{params.error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">No fue posible actualizar ese colaborador.</p>}
        <div className="space-y-3">{members?.map((member) => { const protectedMember = member.role === "owner" || (context.role === "admin" && member.role === "admin"); return <article key={member.user_id} className="flex flex-col gap-4 rounded-2xl border border-black/8 bg-white p-5 sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#e5ece7] font-bold text-[#285645]"><Users size={19} /></span><div className="min-w-0 flex-1"><p className="font-bold">{profileNames.get(member.user_id) || "Usuario sin nombre"}</p><p className="truncate text-xs text-[#7a8780]">{member.user_id}</p></div>{protectedMember ? <span className="rounded-full bg-[#edf0eb] px-3 py-1.5 text-sm font-semibold">{roleLabels[member.role as MembershipRole]}</span> : <form action={manageMember} className="flex flex-wrap gap-2"><input type="hidden" name="userId" value={member.user_id} /><select name="role" defaultValue={member.role} className="h-9 rounded-lg border border-black/10 bg-white px-2 text-sm"><option value="cashier">Cajero</option><option value="inventory">Inventario</option><option value="manager">Gerente</option><option value="viewer">Solo lectura</option>{context.role === "owner" && <option value="admin">Administrador</option>}</select><input type="hidden" name="active" value={member.active ? "false" : "true"} /><button className={`h-9 rounded-lg px-3 text-sm font-bold ${member.active ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{member.active ? "Desactivar" : "Activar"}</button></form>}</article>; })}</div>
      </section>
      <aside className="space-y-5"><section className="rounded-2xl border border-black/8 bg-white p-5"><h2 className="flex items-center gap-2 font-bold"><UserPlus size={18} /> Nueva invitación</h2><p className="mt-2 text-sm leading-6 text-[#68766f]">Usa el mismo correo registrado en Supabase. Para usuarios como Mgarcia, utiliza <strong>mgarcia@stm.internal</strong>.</p><InvitationForm canInviteAdmin={context.role === "owner"} /></section><section className="rounded-2xl border border-black/8 bg-white p-5"><h2 className="font-bold">Invitaciones pendientes</h2><div className="mt-4 space-y-3">{!invitations?.length && <p className="text-sm text-[#7a8780]">No hay invitaciones pendientes.</p>}{invitations?.map((invitation) => <div key={invitation.id} className="border-b border-black/7 pb-3 text-sm last:border-0"><p className="truncate font-semibold">{invitation.email}</p><p className="mt-1 text-xs text-[#7a8780]">{roleLabels[invitation.role as MembershipRole]}</p></div>)}</div></section></aside>
    </div>
  </main>;
}
