"use client";

import { useState } from "react";
import { Ban } from "lucide-react";
import { voidSale } from "./actions";

export function VoidSaleForm({ saleId }: { saleId: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="flex h-10 items-center gap-2 rounded-lg bg-red-50 px-4 text-sm font-bold text-red-700"><Ban size={16} /> Anular venta</button>;
  return <form action={voidSale} className="rounded-xl border border-red-200 bg-red-50 p-4"><input type="hidden" name="saleId" value={saleId} /><label><span className="mb-1.5 block text-sm font-bold text-red-800">Motivo de anulación</span><input name="reason" required minLength={3} maxLength={300} autoFocus className="h-10 w-full rounded-lg border border-red-200 bg-white px-3 text-sm" placeholder="Ej. Venta duplicada" /></label><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="h-9 px-3 text-sm font-bold text-[#617069]">Cancelar</button><button className="h-9 rounded-lg bg-red-700 px-4 text-sm font-bold text-white">Confirmar anulación</button></div></form>;
}
