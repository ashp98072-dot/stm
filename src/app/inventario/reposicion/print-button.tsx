"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-xl bg-[#163f32] px-4 py-3 font-bold text-white print:hidden"><Printer size={17}/>Imprimir</button>;
}
