import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { canCreateSales, getOrganizationContext } from "@/lib/auth/organization";
import { SaleTerminal } from "./sale-terminal";

export default async function SalesPage() {
  const context = await getOrganizationContext();
  const allowed = canCreateSales(context.role);
  const [{ data: rawProducts, error: productsError }, { data: rawCustomers }] = await Promise.all([
    context.supabase.from("products")
      .select("id, name, sku, barcode, price, tax_rate, track_inventory, inventory_levels(quantity, location_id)")
      .eq("organization_id", context.organization.id).eq("active", true).order("name"),
    context.supabase.from("customers").select("id, first_name, last_name, company_name, tax_id")
      .eq("organization_id", context.organization.id).eq("active", true).order("first_name"),
  ]);
  if (productsError) throw new Error("No se pudo cargar el catálogo de venta.");

  const products = (rawProducts ?? []).map((product) => {
    const levels = (product.inventory_levels ?? []) as Array<{ quantity: number | string; location_id: string }>;
    const level = levels.find((item) => item.location_id === context.location.id);
    return {
      id: product.id, name: product.name, sku: product.sku, barcode: product.barcode,
      price: Number(product.price), taxRate: Number(product.tax_rate),
      quantity: product.track_inventory ? Number(level?.quantity ?? 0) : 999999,
    };
  });
  const customers = (rawCustomers ?? []).map((customer) => ({
    id: customer.id,
    name: customer.company_name || `${customer.first_name} ${customer.last_name}`.trim(),
    taxId: customer.tax_id,
  }));
  const currency = context.organization.currency_code === "GTQ" ? "Q" : context.organization.currency_code;

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="bg-[#163f32] text-white"><div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-5 lg:px-10"><div><p className="text-lg font-bold">{context.organization.name}</p><p className="text-xs text-white/60">Caja · {context.location.name}</p></div><Link href="/" className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft size={16} /> Panel</Link></div></header>
      <div className="mx-auto max-w-[1500px] px-6 py-8 lg:px-10">
        <div className="mb-6"><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">Punto de venta</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">Nueva venta</h1></div>
        {allowed ? <SaleTerminal products={products} customers={customers} currency={currency} /> : <div className="rounded-2xl bg-white p-10 text-center font-semibold text-red-700">Tu rol no permite procesar ventas.</div>}
      </div>
    </main>
  );
}
