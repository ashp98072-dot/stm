import Link from "next/link";
import { ArrowLeft, Boxes, Search } from "lucide-react";
import { getOrganizationContext, canManageInventory } from "@/lib/auth/organization";
import { ProductForm } from "./product-form";
import { updateProduct, updateStock } from "./actions";
import { DeactivateProductButton } from "./deactivate-product-button";

const compactInput = "h-9 w-24 rounded-lg border border-black/10 bg-white px-2 text-right outline-none focus:border-[#3e735e]";
const editInput = "h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#3e735e] focus:ring-4 focus:ring-[#3e735e]/10";

export default async function InventoryPage({ searchParams }: PageProps<"/inventario">) {
  const context = await getOrganizationContext();
  const params = await searchParams;
  const query = String(params.q ?? "").trim();
  const notice = params.stock === "updated" ? "Existencia actualizada correctamente." : params.product === "updated" ? "Producto actualizado correctamente." : params.product === "deactivated" ? "Producto desactivado correctamente." : null;
  const alert = typeof params.error === "string" ? (params.error === "permissions" ? "No tienes permiso para modificar inventario." : params.error === "invalid-stock" ? "La existencia y el mínimo deben ser valores válidos no negativos." : params.error === "invalid-product" ? "Los datos del producto no son válidos." : params.error === "duplicate-product" ? "El SKU o código de barras ya está registrado." : params.error === "deactivate" ? "No se pudo desactivar el producto." : params.error === "product" ? "No se pudo actualizar el producto." : "No se pudo actualizar la existencia.") : null;
  const safeQuery = query.replace(/[,().%_]/g, " ").trim();
  let productsQuery = context.supabase
    .from("products")
    .select("id, name, sku, barcode, cost, price, tax_rate, active, manufacturer_id, category:categories(name), manufacturer:manufacturers(name), product_tags(tag_id), inventory_levels(quantity, reorder_point, location_id)")
    .eq("organization_id", context.organization.id)
    .eq("active", true)
    .order("name");
  if (safeQuery) productsQuery = productsQuery.or(`name.ilike.%${safeQuery}%,sku.ilike.%${safeQuery}%,barcode.ilike.%${safeQuery}%`);
  const [
    { data: products, error },
    { data: manufacturers, error: manufacturersError },
    { data: tags, error: tagsError },
  ] = await Promise.all([
    productsQuery,
    context.supabase.from("manufacturers").select("id, name").eq("organization_id", context.organization.id).eq("active", true).order("name"),
    context.supabase.from("tags").select("id, name, color").eq("organization_id", context.organization.id).eq("active", true).order("name"),
  ]);
  if (error || manufacturersError || tagsError) throw new Error("No se pudo cargar el inventario.");
  const canEdit = canManageInventory(context.role);
  const currency = context.organization.currency_code === "GTQ" ? "Q" : context.organization.currency_code;

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="bg-[#163f32] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><div><p className="text-lg font-bold">{context.organization.name}</p><p className="text-xs text-white/60">{context.location.name}</p></div><Link href="/" className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft size={16} /> Panel</Link></div></header>
      <div className="mx-auto max-w-7xl px-6 py-9 lg:px-10">
        {notice && <p className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</p>}
        {alert && <p className="mb-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">{alert}</p>}
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">Catálogo</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">Productos e inventario</h1><p className="mt-2 text-[#68766f]">{products?.length ?? 0} productos en {context.location.name}</p></div>
          <form className="flex h-11 min-w-72 items-center gap-2 rounded-xl border border-black/10 bg-white px-3"><Search size={18} className="text-[#75827b]" /><input name="q" defaultValue={query} className="w-full bg-transparent outline-none" placeholder="Buscar nombre, SKU o código" /></form>
        </div>

        {canEdit && <div className="mb-6"><ProductForm manufacturers={manufacturers ?? []} tags={tags ?? []} /></div>}

        <section className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-[0_12px_35px_rgba(26,52,42,0.05)]">
          <div className="hidden grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_1.4fr] gap-4 border-b border-black/8 bg-[#edf0eb] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[#607067] md:grid"><span>Producto</span><span>Categoría</span><span>Precio</span><span>Existencia</span><span>Ajuste</span></div>
          {!products?.length ? (
            <div className="grid place-items-center px-6 py-20 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-[#e9eee8] text-[#285645]"><Boxes /></span><h2 className="mt-4 text-lg font-bold">No hay productos</h2><p className="mt-1 text-sm text-[#718078]">Agrega el primer producto usando el formulario superior.</p></div>
          ) : products.map((product) => {
            const categoryValue = product.category as { name?: string } | Array<{ name?: string }> | null;
            const category = Array.isArray(categoryValue) ? categoryValue[0]?.name : categoryValue?.name;
            const manufacturerValue = product.manufacturer as { name?: string } | Array<{ name?: string }> | null;
            const manufacturer = Array.isArray(manufacturerValue) ? manufacturerValue[0]?.name : manufacturerValue?.name;
            const selectedTagIds = new Set((product.product_tags ?? []).map((item) => item.tag_id));
            const levels = (product.inventory_levels ?? []) as Array<{ quantity: number | string; reorder_point: number | string; location_id: string }>;
            const level = levels.find((item) => item.location_id === context.location.id);
            const quantity = Number(level?.quantity ?? 0);
            const reorderPoint = Number(level?.reorder_point ?? 0);
            return (
              <article key={product.id} className="grid gap-4 border-b border-black/8 px-5 py-4 last:border-0 md:grid-cols-[minmax(220px,2fr)_1fr_1fr_1fr_1.4fr] md:items-center">
                <div><p className="font-bold">{product.name}</p><p className="mt-1 text-xs text-[#77847d]">{product.sku || "Sin SKU"}{product.barcode ? ` · ${product.barcode}` : ""}</p></div>
                <p className="text-sm text-[#596960]"><span className="mr-2 font-semibold md:hidden">Categoría:</span>{category || "Sin categoría"}{manufacturer ? <span className="mt-1 block text-xs text-[#7a867f]">{manufacturer}</span> : null}</p>
                <p className="font-bold"><span className="mr-2 text-sm font-semibold md:hidden">Precio:</span>{currency} {Number(product.price).toFixed(2)}</p>
                <p className={`font-bold ${quantity <= reorderPoint ? "text-amber-700" : "text-[#285645]"}`}><span className="mr-2 text-sm font-semibold text-[#17251f] md:hidden">Existencia:</span>{quantity}</p>
                {canEdit ? <form action={updateStock} className="grid grid-cols-2 items-end gap-2"><input type="hidden" name="productId" value={product.id} /><label className="text-xs text-[#65746c]">Cant.<input className={compactInput} name="quantity" type="number" step="0.001" defaultValue={quantity} /></label><label className="text-xs text-[#65746c]">Mín.<input className={compactInput} name="reorderPoint" type="number" min="0" step="0.001" defaultValue={reorderPoint} /></label><select name="reason" required defaultValue="count" className="h-9 rounded-lg border border-black/10 bg-white px-2 text-xs"><option value="count">Conteo físico</option><option value="damage">Daño</option><option value="shrinkage">Merma</option><option value="correction">Corrección</option><option value="other">Otro</option></select><button className="h-9 rounded-lg bg-[#163f32] px-3 text-xs font-bold text-white">Guardar</button></form> : <span className="text-sm text-[#77847d]">Solo lectura</span>}
                {canEdit && <details className="md:col-span-5"><summary className="cursor-pointer list-none text-xs font-semibold text-[#285645] hover:underline">Editar información y precios</summary><form action={updateProduct} className="mt-3 grid gap-3 rounded-xl bg-[#f3f5f1] p-4 md:grid-cols-2 xl:grid-cols-4"><input type="hidden" name="productId" value={product.id} /><EditField label="Nombre" name="name" value={product.name} required /><EditField label="Categoría" name="category" value={category} /><EditField label="SKU" name="sku" value={product.sku} /><EditField label="Código de barras" name="barcode" value={product.barcode} /><EditField label="Costo" name="cost" value={Number(product.cost)} type="number" step="0.01" /><EditField label="Precio" name="price" value={Number(product.price)} type="number" step="0.01" /><EditField label="Impuesto %" name="taxRate" value={Number(product.tax_rate) * 100} type="number" step="0.01" /><label><span className="mb-1 block text-xs font-semibold text-[#617067]">Fabricante</span><select className={editInput} name="manufacturerId" defaultValue={product.manufacturer_id ?? ""}><option value="">Sin fabricante</option>{(manufacturers ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><fieldset className="md:col-span-2 xl:col-span-4"><legend className="mb-2 text-xs font-semibold text-[#617067]">Etiquetas</legend><div className="flex flex-wrap gap-2">{(tags ?? []).length ? (tags ?? []).map((tag) => <label key={tag.id} className="flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs"><input type="checkbox" name="tagIds" value={tag.id} defaultChecked={selectedTagIds.has(tag.id)} /><span className="size-2.5 rounded-full" style={{ backgroundColor: tag.color }} />{tag.name}</label>) : <span className="text-xs text-[#77847d]">Sin etiquetas disponibles.</span>}</div></fieldset><div className="flex items-end justify-end md:col-span-2 xl:col-span-4"><button className="h-10 rounded-lg bg-[#163f32] px-4 text-sm font-bold text-white">Guardar información</button></div><div className="md:col-span-2 xl:col-span-4"><DeactivateProductButton productName={product.name} /></div></form></details>}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function EditField({ label, name, value, type = "text", step, required = false }: { label: string; name: string; value: string | number | null | undefined; type?: string; step?: string; required?: boolean }) {
  return <label><span className="mb-1 block text-xs font-semibold text-[#617067]">{label}</span><input className={editInput} name={name} type={type} step={step} min={type === "number" ? 0 : undefined} defaultValue={value ?? ""} required={required} /></label>;
}
