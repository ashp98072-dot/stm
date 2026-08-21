import Link from "next/link";
import { ArrowLeft, Boxes, Search } from "lucide-react";
import { getOrganizationContext, canManageInventory } from "@/lib/auth/organization";
import { ProductForm } from "./product-form";
import { updateStock } from "./actions";

const compactInput = "h-9 w-24 rounded-lg border border-black/10 bg-white px-2 text-right outline-none focus:border-[#3e735e]";

export default async function InventoryPage({ searchParams }: PageProps<"/inventario">) {
  const context = await getOrganizationContext();
  const query = String((await searchParams).q ?? "").trim();
  const safeQuery = query.replace(/[,().%_]/g, " ").trim();
  let productsQuery = context.supabase
    .from("products")
    .select("id, name, sku, barcode, cost, price, active, category:categories(name), inventory_levels(quantity, reorder_point, location_id)")
    .eq("organization_id", context.organization.id)
    .eq("active", true)
    .order("name");
  if (safeQuery) productsQuery = productsQuery.or(`name.ilike.%${safeQuery}%,sku.ilike.%${safeQuery}%,barcode.ilike.%${safeQuery}%`);
  const { data: products, error } = await productsQuery;
  if (error) throw new Error("No se pudo cargar el inventario.");
  const canEdit = canManageInventory(context.role);
  const currency = context.organization.currency_code === "GTQ" ? "Q" : context.organization.currency_code;

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="bg-[#163f32] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><div><p className="text-lg font-bold">{context.organization.name}</p><p className="text-xs text-white/60">{context.location.name}</p></div><Link href="/" className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft size={16} /> Panel</Link></div></header>
      <div className="mx-auto max-w-7xl px-6 py-9 lg:px-10">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">Catálogo</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">Productos e inventario</h1><p className="mt-2 text-[#68766f]">{products?.length ?? 0} productos en {context.location.name}</p></div>
          <form className="flex h-11 min-w-72 items-center gap-2 rounded-xl border border-black/10 bg-white px-3"><Search size={18} className="text-[#75827b]" /><input name="q" defaultValue={query} className="w-full bg-transparent outline-none" placeholder="Buscar nombre, SKU o código" /></form>
        </div>

        {canEdit && <div className="mb-6"><ProductForm /></div>}

        <section className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-[0_12px_35px_rgba(26,52,42,0.05)]">
          <div className="hidden grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_1.4fr] gap-4 border-b border-black/8 bg-[#edf0eb] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#607067] md:grid"><span>Producto</span><span>Categoría</span><span>Precio</span><span>Existencia</span><span>Ajuste</span></div>
          {!products?.length ? (
            <div className="grid place-items-center px-6 py-20 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-[#e9eee8] text-[#285645]"><Boxes /></span><h2 className="mt-4 text-lg font-bold">No hay productos</h2><p className="mt-1 text-sm text-[#718078]">Agrega el primer producto usando el formulario superior.</p></div>
          ) : products.map((product) => {
            const categoryValue = product.category as { name?: string } | Array<{ name?: string }> | null;
            const category = Array.isArray(categoryValue) ? categoryValue[0]?.name : categoryValue?.name;
            const levels = (product.inventory_levels ?? []) as Array<{ quantity: number | string; reorder_point: number | string; location_id: string }>;
            const level = levels.find((item) => item.location_id === context.location.id);
            const quantity = Number(level?.quantity ?? 0);
            const reorderPoint = Number(level?.reorder_point ?? 0);
            return (
              <article key={product.id} className="grid gap-4 border-b border-black/8 px-5 py-4 last:border-0 md:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_1.4fr] md:items-center">
                <div><p className="font-bold">{product.name}</p><p className="mt-1 text-xs text-[#77847d]">{product.sku || "Sin SKU"}{product.barcode ? ` · ${product.barcode}` : ""}</p></div>
                <p className="text-sm text-[#596960]"><span className="mr-2 font-semibold md:hidden">Categoría:</span>{category || "Sin categoría"}</p>
                <p className="font-bold"><span className="mr-2 text-sm font-semibold md:hidden">Precio:</span>{currency} {Number(product.price).toFixed(2)}</p>
                <p className={`font-bold ${quantity <= reorderPoint ? "text-amber-700" : "text-[#285645]"}`}><span className="mr-2 text-sm font-semibold text-[#17251f] md:hidden">Existencia:</span>{quantity}</p>
                {canEdit ? <form action={updateStock} className="flex items-center gap-2"><input type="hidden" name="productId" value={product.id} /><label className="text-xs text-[#65746c]">Cant.<input className={compactInput} name="quantity" type="number" step="0.001" defaultValue={quantity} /></label><label className="text-xs text-[#65746c]">Mín.<input className={compactInput} name="reorderPoint" type="number" min="0" step="0.001" defaultValue={reorderPoint} /></label><button className="h-9 rounded-lg bg-[#163f32] px-3 text-xs font-bold text-white">Guardar</button></form> : <span className="text-sm text-[#77847d]">Solo lectura</span>}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
