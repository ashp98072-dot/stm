"use client";

import { useActionState } from "react";
import { PackagePlus } from "lucide-react";
import { createProduct, type InventoryActionState } from "./actions";

const initialState: InventoryActionState = { message: "" };
const inputClass = "h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none focus:border-[#3e735e] focus:ring-4 focus:ring-[#3e735e]/10";

export function ProductForm() {
  const [state, action, pending] = useActionState(createProduct, initialState);
  return (
    <details className="group rounded-2xl border border-black/8 bg-white shadow-[0_12px_35px_rgba(26,52,42,0.05)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-bold">
        <span className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-[#163f32] text-[#d7f36b]"><PackagePlus size={18} /></span>Agregar producto</span>
        <span className="text-sm font-medium text-[#6e7d75] group-open:hidden">Abrir formulario</span>
        <span className="hidden text-sm font-medium text-[#6e7d75] group-open:inline">Cerrar</span>
      </summary>
      <form action={action} className="grid gap-4 border-t border-black/8 p-5 md:grid-cols-2 xl:grid-cols-4">
        <label className="md:col-span-2"><span className="mb-1.5 block text-sm font-semibold">Nombre *</span><input className={inputClass} name="name" required minLength={2} placeholder="Harina de trigo" /></label>
        <label><span className="mb-1.5 block text-sm font-semibold">Categoría</span><input className={inputClass} name="category" placeholder="Abarrotes" /></label>
        <label><span className="mb-1.5 block text-sm font-semibold">SKU</span><input className={inputClass} name="sku" placeholder="HAR-001" /></label>
        <label><span className="mb-1.5 block text-sm font-semibold">Código de barras</span><input className={inputClass} name="barcode" inputMode="numeric" /></label>
        <label><span className="mb-1.5 block text-sm font-semibold">Costo</span><input className={inputClass} name="cost" type="number" min="0" step="0.01" defaultValue="0" required /></label>
        <label><span className="mb-1.5 block text-sm font-semibold">Precio</span><input className={inputClass} name="price" type="number" min="0" step="0.01" defaultValue="0" required /></label>
        <label><span className="mb-1.5 block text-sm font-semibold">Impuesto %</span><input className={inputClass} name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue="0" required /></label>
        <label><span className="mb-1.5 block text-sm font-semibold">Existencia inicial</span><input className={inputClass} name="quantity" type="number" step="0.001" defaultValue="0" required /></label>
        <label><span className="mb-1.5 block text-sm font-semibold">Punto de reposición</span><input className={inputClass} name="reorderPoint" type="number" min="0" step="0.001" defaultValue="0" required /></label>
        <div className="flex items-end md:col-span-2 xl:col-span-3">
          {state.message && <p role="status" className={`text-sm font-semibold ${state.success ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p>}
        </div>
        <button disabled={pending} className="h-11 rounded-xl bg-[#d7f36b] px-5 font-bold text-[#163f32] transition hover:-translate-y-0.5 disabled:opacity-60">{pending ? "Guardando…" : "Guardar producto"}</button>
      </form>
    </details>
  );
}
