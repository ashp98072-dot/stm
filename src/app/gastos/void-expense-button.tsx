"use client";

import { voidExpense } from "./actions";
export function VoidExpenseButton({ description }: { description: string }) { return <button type="submit" formAction={voidExpense} onClick={(event) => { if (!window.confirm(`¿Anular el gasto “${description}”?`)) event.preventDefault(); }} className="text-xs font-semibold text-red-700 hover:underline">Anular</button>; }
