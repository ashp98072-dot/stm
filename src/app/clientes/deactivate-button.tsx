"use client";

import { deactivateCustomer } from "./actions";

export function DeactivateButton({ customerName }: { customerName: string }) {
  return (
    <button
      type="submit"
      formAction={deactivateCustomer}
      onClick={(event) => { if (!window.confirm(`¿Desactivar a ${customerName}?`)) event.preventDefault(); }}
      className="text-xs font-semibold text-red-700 hover:underline"
    >
      Desactivar
    </button>
  );
}
