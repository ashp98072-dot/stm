"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { createCustomer, type CustomerActionState } from "./actions";

const initialState: CustomerActionState = { message: "" };
export const customerInputClass = "h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-[#3e735e] focus:ring-4 focus:ring-[#3e735e]/10";

export function CustomerForm() {
  const [state, action, pending] = useActionState(createCustomer, initialState);
  return (
    <details className="group rounded-2xl border border-black/8 bg-white shadow-[0_12px_35px_rgba(26,52,42,0.05)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-bold">
        <span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-[#163f32] text-[#d7f36b]"><UserPlus size={18} /></span>Agregar cliente</span>
        <span className="text-sm font-medium text-[#6e7d75] group-open:hidden">Abrir formulario</span><span className="hidden text-sm font-medium text-[#6e7d75] group-open:inline">Cerrar</span>
      </summary>
      <form action={action} className="grid gap-4 border-t border-black/8 p-5 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Nombre *" name="firstName" required />
        <Field label="Apellido" name="lastName" />
        <Field label="Empresa" name="companyName" />
        <Field label="NIT / identificación fiscal" name="taxId" />
        <Field label="Correo" name="email" type="email" />
        <Field label="Teléfono" name="phone" type="tel" />
        <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-semibold">Dirección</span><input className={customerInputClass} name="address" /></label>
        <label className="md:col-span-2 xl:col-span-3"><span className="mb-1.5 block text-sm font-semibold">Notas</span><input className={customerInputClass} name="notes" /></label>
        <button disabled={pending} className="h-11 self-end rounded-xl bg-[#d7f36b] px-5 font-bold text-[#163f32] transition hover:-translate-y-0.5 disabled:opacity-60">{pending ? "Guardando…" : "Guardar cliente"}</button>
        {state.message && <p role="status" className={`text-sm font-semibold md:col-span-2 xl:col-span-4 ${state.success ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
      </form>
    </details>
  );
}

function Field({ label, name, type = "text", required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return <label><span className="mb-1.5 block text-sm font-semibold">{label}</span><input className={customerInputClass} name={name} type={type} required={required} /></label>;
}
