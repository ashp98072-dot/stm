"use client";

import { useActionState } from "react";
import { Building2 } from "lucide-react";
import { createSupplier, type PurchaseState } from "./actions";

const initial: PurchaseState = { message: "" };
const input = "h-10 w-full rounded-lg border border-black/10 px-3 text-sm outline-none focus:border-[#3e735e]";
export function SupplierForm() {
  const [state, action, pending] = useActionState(createSupplier, initial);
  return <details className="group rounded-2xl border border-black/8 bg-white"><summary className="flex cursor-pointer list-none items-center gap-3 p-4 font-bold"><span className="grid size-9 place-items-center rounded-lg bg-[#163f32] text-[#d7f36b]"><Building2 size={18} /></span>Nuevo proveedor</summary><form action={action} className="grid gap-3 border-t border-black/8 p-4 md:grid-cols-3"><Field label="Nombre *" name="name" required /><Field label="Contacto" name="contactName" /><Field label="NIT" name="taxId" /><Field label="Correo" name="email" type="email" /><Field label="Teléfono" name="phone" /><Field label="Dirección" name="address" /><Field label="Límite de crédito" name="creditLimit" type="number"/><div className="flex items-center md:col-span-2">{state.message && <p className={`text-sm font-semibold ${state.success ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}</div><button disabled={pending} className="h-10 rounded-lg bg-[#d7f36b] font-bold text-[#163f32]">{pending ? "Guardando…" : "Guardar proveedor"}</button></form></details>;
}
function Field({ label, name, type = "text", required = false }: { label: string; name: string; type?: string; required?: boolean }) { return <label><span className="mb-1 block text-xs font-semibold">{label}</span><input className={input} name={name} type={type} min={type==="number"?0:undefined} step={type==="number"?".01":undefined} required={required} /></label>; }
