import Link from "next/link";
import { ArrowLeft, Boxes, CircleDollarSign, PackageSearch, ShoppingCart } from "lucide-react";
import { getOrganizationContext } from "@/lib/auth/organization";
import { PrintButton } from "./print-button";

export default async function ReplenishmentPage() {
  const context = await getOrganizationContext();
  if (!["owner", "admin", "manager", "inventory", "viewer"].includes(context.role)) return <main>Acceso restringido</main>;
  const { data: products, error } = await context.supabase.from("products")
    .select("id,name,sku,cost,category:categories(name),inventory_levels(quantity,reorder_point,location_id),product_variants(id,name,sku,cost,active,variant_inventory_levels(quantity,reorder_point,location_id))")
    .eq("organization_id", context.organization.id).eq("active", true).order("name");
  if (error) throw new Error("No se pudo preparar la reposición de inventario.");

  const rows = (products ?? []).flatMap((product) => {
    const level = (product.inventory_levels as Array<{ quantity: string | number; reorder_point: string | number; location_id: string }> ?? []).find((item) => item.location_id === context.location.id);
    const categoryValue = product.category as { name?: string } | Array<{ name?: string }> | null;
    const category = (Array.isArray(categoryValue) ? categoryValue[0]?.name : categoryValue?.name) ?? "Sin categoría";
    const candidates = [{ id: `product-${product.id}`, name: product.name, sku: product.sku, cost: Number(product.cost), level }, ...((product.product_variants as Array<{ id:string; name:string; sku:string|null; cost:string|number|null; active:boolean; variant_inventory_levels:Array<{ quantity:string|number; reorder_point:string|number; location_id:string }> }> ?? []).filter((variant) => variant.active).map((variant) => ({ id: `variant-${variant.id}`, name: `${product.name} · ${variant.name}`, sku: variant.sku || product.sku, cost: Number(variant.cost ?? product.cost), level: (variant.variant_inventory_levels ?? []).find((item) => item.location_id === context.location.id) })))];
    return candidates.flatMap((candidate) => {
      const quantity = Number(candidate.level?.quantity ?? 0), reorderPoint = Number(candidate.level?.reorder_point ?? 0);
      if (reorderPoint <= 0 || quantity > reorderPoint) return [];
      const target = reorderPoint * 2, suggested = Math.max(0, target - quantity);
      return [{ ...candidate, category, quantity, reorderPoint, target, suggested, estimated: suggested * candidate.cost }];
    });
  }).sort((a, b) => (a.quantity <= 0 === (b.quantity <= 0) ? b.estimated - a.estimated : a.quantity <= 0 ? -1 : 1));
  const outOfStock = rows.filter((row) => row.quantity <= 0).length;
  const units = rows.reduce((sum, row) => sum + row.suggested, 0), estimated = rows.reduce((sum, row) => sum + row.estimated, 0);
  const currency = context.organization.currency_code === "GTQ" ? "Q" : context.organization.currency_code;

  return <main className="min-h-screen bg-[#f4f5f1] text-[#17251f] print:bg-white">
    <header className="bg-[#163f32] text-white print:hidden"><div className="mx-auto flex max-w-7xl justify-between px-6 py-5 lg:px-10"><div><p className="font-bold">{context.organization.name}</p><p className="text-xs text-white/60">Reposición · {context.location.name}</p></div><Link href="/inventario" className="flex items-center gap-2"><ArrowLeft size={16}/>Inventario</Link></div></header>
    <div className="mx-auto max-w-7xl space-y-7 px-6 py-9 lg:px-10 print:max-w-none print:p-0">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#517064]">Abastecimiento</p><h1 className="mt-2 text-4xl font-bold">Lista de reposición</h1><p className="mt-2 text-[#68766f]">Sugerencia para recuperar el doble del punto mínimo configurado.</p></div><PrintButton/></div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Productos por reponer" value={String(rows.length)} icon={PackageSearch}/><Metric label="Productos agotados" value={String(outOfStock)} icon={Boxes}/><Metric label="Unidades sugeridas" value={quantity(units)} icon={ShoppingCart}/><Metric label="Costo estimado" value={`${currency} ${estimated.toFixed(2)}`} icon={CircleDollarSign}/></section>
      <section className="overflow-hidden rounded-2xl border border-black/8 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#edf0eb] text-xs uppercase"><tr><th className="p-4">Prioridad / producto</th><th className="p-4">Categoría</th><th className="p-4 text-right">Actual</th><th className="p-4 text-right">Mínimo</th><th className="p-4 text-right">Objetivo</th><th className="p-4 text-right">Comprar</th><th className="p-4 text-right">Costo estimado</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={`border-t ${row.quantity <= 0 ? "bg-red-50/70" : "bg-amber-50/40"}`}><td className="p-4"><strong>{row.name}</strong><p className={`text-xs font-semibold ${row.quantity <= 0 ? "text-red-700" : "text-amber-700"}`}>{row.quantity <= 0 ? "Agotado" : "Stock bajo"} · {row.sku || "Sin SKU"}</p></td><td className="p-4">{row.category}</td><td className="p-4 text-right font-bold">{quantity(row.quantity)}</td><td className="p-4 text-right">{quantity(row.reorderPoint)}</td><td className="p-4 text-right">{quantity(row.target)}</td><td className="p-4 text-right text-lg font-black text-[#285645]">{quantity(row.suggested)}</td><td className="p-4 text-right font-bold">{currency} {row.estimated.toFixed(2)}</td></tr>)}{!rows.length && <tr><td colSpan={7} className="p-14 text-center text-[#75837b]">Todo el inventario está por encima de sus puntos de reposición.</td></tr>}</tbody></table></div></section>
      <p className="text-xs text-[#75837b]">El costo es estimado con el costo actual del producto. Ajusta cantidades y precios al registrar la compra.</p>
    </div>
  </main>;
}

function Metric({label,value,icon:Icon}:{label:string;value:string;icon:typeof Boxes}){return <article className="rounded-2xl border border-black/8 bg-white p-5"><div className="flex justify-between text-sm text-[#617069]"><span>{label}</span><Icon size={18}/></div><p className="mt-5 text-2xl font-bold">{value}</p></article>}
function quantity(value:number){return value.toFixed(3).replace(/\.000$/,"").replace(/(\.\d*[1-9])0+$/,"$1")}
