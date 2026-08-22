"use client";

import { useActionState } from "react";
import { Receipt } from "lucide-react";
import { createExpense, type ExpenseState } from "./actions";

const initial: ExpenseState = { message: "" };
const input = "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#3e735e]";
export function ExpenseForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(createExpense, initial);
  return <details className="group rounded-2xl border border-black/8 bg-white"><summary className="flex cursor-pointer list-none items-center gap-3 p-4 font-bold"><span className="grid size-9 place-items-center rounded-lg bg-[#163f32] text-[#d7f36b]"><Receipt size={18} /></span>Registrar gasto</summary><form action={action} className="grid gap-3 border-t border-black/8 p-4 md:grid-cols-2 xl:grid-cols-4"><label className="md:col-span-2"><span className="mb-1 block text-xs font-semibold">Descripción *</span><input className={input} name="description" required /></label><Field label="Categoría *" name="category" required /><Field label="Factura / referencia" name="reference" /><Field label="Monto antes de impuesto" name="amount" type="number" step="0.01" required /><Field label="Impuesto" name="taxAmount" type="number" step="0.01" defaultValue="0" required /><label><span className="mb-1 block text-xs font-semibold">Método de pago</span><select className={input} name="paymentMethod"><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="other">Otro</option></select></label><Field label="Fecha" name="date" type="date" defaultValue={today} required /><div className="flex items-center md:col-span-2 xl:col-span-3">{state.message && <p className={`text-sm font-semibold ${state.success ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}</div><button disabled={pending} className="h-10 rounded-lg bg-[#d7f36b] font-bold text-[#163f32]">{pending ? "Guardando…" : "Guardar gasto"}</button></form></details>;
}
function Field({ label, name, type = "text", step, defaultValue, required = false }: { label: string; name: string; type?: string; step?: string; defaultValue?: string; required?: boolean }) { return <label><span className="mb-1 block text-xs font-semibold">{label}</span><input className={input} name={name} type={type} step={step} min={type === "number" ? 0 : undefined} defaultValue={defaultValue} required={required} /></label>; }
