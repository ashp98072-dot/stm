import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import {
  canManageInventory,
  getOrganizationContext,
} from "@/lib/auth/organization";
import { updateSupplier } from "./actions";
const input =
  "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm";
export default async function SuppliersPage({ searchParams }: PageProps<"/proveedores">) {
  const params = await searchParams;
  const notice = params.updated === "1" ? "Proveedor actualizado correctamente." : null;
  const alert = typeof params.error === "string" ? (params.error === "permissions" ? "No tienes permiso para modificar proveedores." : params.error === "invalid" ? "Los datos del proveedor no son válidos." : "No se pudo actualizar el proveedor.") : null;
  const c = await getOrganizationContext(),
    canEdit = canManageInventory(c.role);
  const [{ data: suppliers }, { data: movements }] = await Promise.all([
      c.supabase
        .from("suppliers")
        .select("id,name,contact_name,email,phone,tax_id,address,credit_limit")
        .eq("organization_id", c.organization.id)
        .eq("active", true)
        .order("name"),
      c.supabase
        .from("supplier_account_movements")
        .select("supplier_id,type,amount")
        .eq("organization_id", c.organization.id),
    ]),
    balances = new Map<string, number>();
  (movements ?? []).forEach((m) =>
    balances.set(
      m.supplier_id,
      (balances.get(m.supplier_id) ?? 0) +
        (m.type === "charge" ? Number(m.amount) : -Number(m.amount)),
    ),
  );
  const currency =
    c.organization.currency_code === "GTQ" ? "Q" : c.organization.currency_code;
  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="bg-[#163f32] text-white">
        <div className="mx-auto flex max-w-6xl justify-between px-6 py-5">
          <div>
            <p className="font-bold">{c.organization.name}</p>
            <p className="text-xs text-white/60">Directorio de proveedores</p>
          </div>
          <Link href="/" className="flex items-center gap-2">
            <ArrowLeft size={16} />
            Panel
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-6 px-6 py-9">
        {notice && <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</p>}
        {alert && <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">{alert}</p>}
        <div>
          <p className="text-sm font-bold uppercase tracking-[.18em] text-[#517064]">
            Abastecimiento
          </p>
          <h1 className="mt-2 text-4xl font-bold">Proveedores</h1>
        </div>
        <div className="space-y-3">
          {suppliers?.map((s) => {
            const balance = balances.get(s.id) ?? 0,
              available =
                s.credit_limit == null
                  ? null
                  : Math.max(0, Number(s.credit_limit) - balance);
            return (
              <article
                key={s.id}
                className="rounded-2xl border border-black/8 bg-white"
              >
                <div className="grid gap-3 p-5 sm:grid-cols-[42px_1fr_auto] sm:items-center">
                  <span className="grid size-10 place-items-center rounded-xl bg-[#e9eee8] text-[#285645]">
                    <Building2 size={18} />
                  </span>
                  <div>
                    <Link
                      href={`/proveedores/${s.id}`}
                      className="font-bold text-[#285645] hover:underline"
                    >
                      {s.name}
                    </Link>
                    <p className="text-sm text-[#68766f]">
                      {s.contact_name || "Sin contacto"} ·{" "}
                      {s.phone || "Sin teléfono"}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p>
                      Saldo:{" "}
                      <b>
                        {currency} {balance.toFixed(2)}
                      </b>
                    </p>
                    <p className="text-xs text-[#75837b]">
                      {available == null
                        ? "Crédito sin límite"
                        : `Disponible ${currency} ${available.toFixed(2)}`}
                    </p>
                  </div>
                </div>
                {canEdit && (
                  <details className="border-t">
                    <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-[#285645]">
                      Editar proveedor y límite
                    </summary>
                    <form
                      action={updateSupplier}
                      className="grid gap-3 border-t bg-[#f8f9f6] p-5 md:grid-cols-3"
                    >
                      <input type="hidden" name="id" value={s.id} />
                      <Field
                        label="Nombre"
                        name="name"
                        value={s.name}
                        required
                      />
                      <Field
                        label="Contacto"
                        name="contactName"
                        value={s.contact_name}
                      />
                      <Field label="NIT" name="taxId" value={s.tax_id} />
                      <Field
                        label="Correo"
                        name="email"
                        value={s.email}
                        type="email"
                      />
                      <Field label="Teléfono" name="phone" value={s.phone} />
                      <Field
                        label="Dirección"
                        name="address"
                        value={s.address}
                      />
                      <Field
                        label="Límite de crédito"
                        name="creditLimit"
                        value={
                          s.credit_limit == null ? null : String(s.credit_limit)
                        }
                        type="number"
                      />
                      <button className="h-10 rounded-lg bg-[#163f32] px-4 font-bold text-white md:col-span-2">
                        Guardar cambios
                      </button>
                    </form>
                  </details>
                )}
              </article>
            );
          })}
          {!suppliers?.length && (
            <p className="rounded-2xl bg-white p-12 text-center">
              No hay proveedores.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
function Field({
  label,
  name,
  value,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  value: string | null;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold">{label}</span>
      <input
        className={input}
        name={name}
        defaultValue={value ?? ""}
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? ".01" : undefined}
        required={required}
      />
    </label>
  );
}
