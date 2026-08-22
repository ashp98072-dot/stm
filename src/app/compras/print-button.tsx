"use client";
import{Printer}from"lucide-react";
export function PurchasePrintButton(){return <button onClick={()=>window.print()} className="flex h-10 items-center gap-2 rounded-lg bg-[#163f32] px-4 text-sm font-bold text-white"><Printer size={16}/>Imprimir recepción</button>}
