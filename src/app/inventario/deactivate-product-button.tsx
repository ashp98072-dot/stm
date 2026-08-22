"use client";

import { deactivateProduct } from "./actions";

export function DeactivateProductButton({ productName }: { productName: string }) {
  return (
    <button
      type="submit"
      formAction={deactivateProduct}
      onClick={(event) => { if (!window.confirm(`¿Desactivar ${productName}? Ya no aparecerá en ventas.`)) event.preventDefault(); }}
      className="text-xs font-semibold text-red-700 hover:underline"
    >
      Desactivar producto
    </button>
  );
}
