import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { canManageInventory, getOrganizationContext } from "@/lib/auth/organization";
import { PurchaseTerminal } from "./purchase-terminal";
import { SupplierForm } from "./supplier-form";

export default async function PurchasesPage({ searchParams }: PageProps<"/compras">) {
  const context = await getOrganizationContext();
  const params = await searchParams;
  const allowed = canManageInventory(context.role);
  const [{ data: products }, { data: suppliers }, { data: purchases }] = await Promise.all([
    context.supabase.from("products").select("id, name, sku, cost").eq("organization_id", context.organization.id).eq("active", true).order("name"),
    context.supabase.from("suppliers").select("id, name").eq("organization_id", context.organization.id).eq("active", true).order("name"),
    context.supabase.from("purchases").select("id, reference, total, received_at, supplier:suppliers(name)").eq("organization_id", context.organization.id).order("received_at", { ascending: false }).limit(10),
  ]);
  const currency = context.organization.currency_code === "GTQ" ? "Q" : context.organization.currency_code;

  return <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]"><header className="bg-[#163f32] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><div><p className="text-lg font-bold">{context.organization.name}</p><p className="text-xs text-white/60">Compras · {context.location.name}</p></div><Link href="/" className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft size={16} /> Panel</Link></div></header><div className="mx-auto max-w-7xl space-y-6 px-6 py-9 lg:px-10"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">Abastecimiento</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">Compras y proveedores</h1></div>{typeof params.received === "string" && <div className="flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 font-semibold text-emerald-800"><CheckCircle2 size={20} /> Recepción completada y existencias actualizadas.</div>}{allowed ? <><SupplierForm /><PurchaseTerminal products={(products ?? []).map((product) => ({ ...product, cost: Number(product.cost) }))} suppliers={suppliers ?? []} currency={currency} /><section className="rounded-2xl border border-black/8 bg-white"><h2 className="border-b border-black/8 p-4 font-bold">Recepciones recientes</h2><div className="divide-y divide-black/8">{!purchases?.length && <p className="p-8 text-center text-sm text-[#728078]">Todavía no hay recepciones.</p>}{(purchases ?? []).map((purchase) => { const supplierValue = purchase.supplier as { name?: string } | Array<{ name?: string }> | null; const supplier = Array.isArray(supplierValue) ? supplierValue[0] : supplierValue; return <div key={purchase.id} className="grid gap-2 p-4 text-sm md:grid-cols-[1fr_1fr_auto]"><div><p className="font-bold">{purchase.reference || "Sin referencia"}</p><p className="text-xs text-[#75837b]">{supplier?.name || "Sin proveedor"}</p></div><p className="text-[#617067]">{new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guatemala" }).format(new Date(purchase.received_at))}</p><p className="font-bold">{currency} {Number(purchase.total).toFixed(2)}</p></div>; })}</div></section></> : <div className="rounded-2xl bg-white p-10 text-center font-semibold text-red-700">Tu rol no permite registrar compras.</div>}</div></main>;
}
