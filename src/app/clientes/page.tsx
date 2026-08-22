import Link from "next/link";
import { ArrowLeft, Search, Users } from "lucide-react";
import { canManageCustomers, getOrganizationContext } from "@/lib/auth/organization";
import { CustomerForm } from "./customer-form";
import { DeactivateButton } from "./deactivate-button";
import { updateCustomer } from "./actions";

const inputClass = "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#3e735e] focus:ring-4 focus:ring-[#3e735e]/10";

export default async function CustomersPage({ searchParams }: PageProps<"/clientes">) {
  const context = await getOrganizationContext();
  const query = String((await searchParams).q ?? "").trim();
  const safeQuery = query.replace(/[,().%_]/g, " ").trim();
  let customersQuery = context.supabase.from("customers")
    .select("id, first_name, last_name, company_name, email, phone, tax_id, address, notes, credit_limit, created_at")
    .eq("organization_id", context.organization.id).eq("active", true)
    .order("created_at", { ascending: false });
  if (safeQuery) customersQuery = customersQuery.or(`first_name.ilike.%${safeQuery}%,last_name.ilike.%${safeQuery}%,company_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%,tax_id.ilike.%${safeQuery}%`);
  const { data: customers, error } = await customersQuery;
  if (error) throw new Error("No se pudo cargar el directorio de clientes.");
  const canEdit = canManageCustomers(context.role);
  const canManageCredit = ["owner", "admin", "manager"].includes(context.role);

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="bg-[#163f32] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><div><p className="text-lg font-bold">{context.organization.name}</p><p className="text-xs text-white/60">Directorio de clientes</p></div><Link href="/" className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft size={16} /> Panel</Link></div></header>
      <div className="mx-auto max-w-7xl px-6 py-9 lg:px-10">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">Personas</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">Clientes</h1><p className="mt-2 text-[#68766f]">{customers?.length ?? 0} clientes activos</p></div>
          <form className="flex h-11 min-w-72 items-center gap-2 rounded-xl border border-black/10 bg-white px-3"><Search size={18} className="text-[#75827b]" /><input name="q" defaultValue={query} className="w-full bg-transparent outline-none" placeholder="Nombre, teléfono, NIT…" /></form>
        </div>
        {canEdit && <div className="mb-6"><CustomerForm canManageCredit={canManageCredit} /></div>}

        <section className="space-y-3">
          {!customers?.length ? (
            <div className="grid place-items-center rounded-2xl border border-black/8 bg-white px-6 py-20 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-[#e9eee8] text-[#285645]"><Users /></span><h2 className="mt-4 text-lg font-bold">No hay clientes</h2><p className="mt-1 text-sm text-[#718078]">Registra el primer cliente usando el formulario superior.</p></div>
          ) : customers.map((customer) => (
            <article key={customer.id} className="rounded-2xl border border-black/8 bg-white shadow-[0_8px_25px_rgba(26,52,42,0.04)]">
              <div className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center">
                <div><Link href={`/clientes/${customer.id}`} className="font-bold text-[#285645] hover:underline">{customer.first_name} {customer.last_name}</Link><p className="mt-1 text-sm text-[#68766f]">{customer.company_name || "Cliente individual"}{customer.tax_id ? ` · NIT ${customer.tax_id}` : ""}</p></div>
                <div className="text-sm text-[#53645b] md:text-right"><p>{customer.phone || "Sin teléfono"}</p><p>{customer.email || "Sin correo"}</p><p className="mt-1 text-xs font-bold">Crédito: {customer.credit_limit == null ? "Sin límite" : `${context.organization.currency_code === "GTQ" ? "Q" : context.organization.currency_code} ${Number(customer.credit_limit).toFixed(2)}`}</p></div>
              </div>
              {canEdit && (
                <details className="border-t border-black/8">
                  <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-[#285645]">Editar información</summary>
                  <form action={updateCustomer} className="grid gap-3 border-t border-black/8 bg-[#f8f9f6] p-5 md:grid-cols-2 xl:grid-cols-4">
                    <input type="hidden" name="customerId" value={customer.id} />
                    <EditField label="Nombre" name="firstName" value={customer.first_name} required />
                    <EditField label="Apellido" name="lastName" value={customer.last_name} />
                    <EditField label="Empresa" name="companyName" value={customer.company_name} />
                    <EditField label="NIT" name="taxId" value={customer.tax_id} />
                    <EditField label="Correo" name="email" value={customer.email} type="email" />
                    <EditField label="Teléfono" name="phone" value={customer.phone} />
                    <EditField label="Dirección" name="address" value={customer.address} />
                    <EditField label="Notas" name="notes" value={customer.notes} />
                    {canManageCredit && <EditField label="Límite de crédito" name="creditLimit" value={customer.credit_limit == null ? null : String(customer.credit_limit)} type="number" />}
                    <div className="flex items-center justify-between gap-4 md:col-span-2 xl:col-span-4"><DeactivateButton customerName={`${customer.first_name} ${customer.last_name}`.trim()} /><button className="h-10 rounded-lg bg-[#163f32] px-5 text-sm font-bold text-white">Guardar cambios</button></div>
                  </form>
                </details>
              )}
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function EditField({ label, name, value, type = "text", required = false }: { label: string; name: string; value: string | null; type?: string; required?: boolean }) {
  return <label><span className="mb-1 block text-xs font-semibold text-[#617067]">{label}</span><input className={inputClass} name={name} type={type} defaultValue={value ?? ""} required={required} /></label>;
}
