import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  FileClock,
  HandCoins,
  Landmark,
} from "lucide-react";
import { getOrganizationContext } from "@/lib/auth/organization";

export default async function AlertsPage() {
  const context = await getOrganizationContext();
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: context.organization.timezone,
  });
  const nextWeek = new Date(`${today}T12:00:00Z`);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);
  const weekLimit = nextWeek.toISOString().slice(0, 10);

  const [stockResult, quotesResult, customersResult, receivablesResult, suppliersResult, payablesResult] =
    await Promise.all([
      context.supabase
        .from("inventory_levels")
        .select("quantity,reorder_point,product:products(id,name,sku)")
        .eq("organization_id", context.organization.id)
        .eq("location_id", context.location.id),
      context.supabase
        .from("quotes")
        .select("id,quote_number,total,valid_until")
        .eq("organization_id", context.organization.id)
        .eq("status", "draft")
        .not("valid_until", "is", null)
        .lte("valid_until", weekLimit)
        .order("valid_until"),
      context.supabase
        .from("customers")
        .select("id,first_name,last_name,company_name")
        .eq("organization_id", context.organization.id),
      context.supabase
        .from("customer_account_movements")
        .select("customer_id,type,amount")
        .eq("organization_id", context.organization.id),
      context.supabase
        .from("suppliers")
        .select("id,name")
        .eq("organization_id", context.organization.id),
      context.supabase
        .from("supplier_account_movements")
        .select("supplier_id,type,amount")
        .eq("organization_id", context.organization.id),
    ]);

  const stock = (stockResult.data ?? []).filter(
    (level) => Number(level.quantity) <= Number(level.reorder_point),
  );
  const customerBalances = new Map<string, number>();
  for (const movement of receivablesResult.data ?? []) {
    customerBalances.set(
      movement.customer_id,
      (customerBalances.get(movement.customer_id) ?? 0) +
        (movement.type === "charge" ? Number(movement.amount) : -Number(movement.amount)),
    );
  }
  const supplierBalances = new Map<string, number>();
  for (const movement of payablesResult.data ?? []) {
    supplierBalances.set(
      movement.supplier_id,
      (supplierBalances.get(movement.supplier_id) ?? 0) +
        (movement.type === "charge" ? Number(movement.amount) : -Number(movement.amount)),
    );
  }
  const receivables = (customersResult.data ?? [])
    .map((customer) => ({
      ...customer,
      balance: customerBalances.get(customer.id) ?? 0,
      name:
        customer.company_name ||
        `${customer.first_name} ${customer.last_name}`.trim(),
    }))
    .filter((customer) => customer.balance > 0.005)
    .sort((a, b) => b.balance - a.balance);
  const payables = (suppliersResult.data ?? [])
    .map((supplier) => ({
      ...supplier,
      balance: supplierBalances.get(supplier.id) ?? 0,
    }))
    .filter((supplier) => supplier.balance > 0.005)
    .sort((a, b) => b.balance - a.balance);
  const currency =
    context.organization.currency_code === "GTQ"
      ? "Q"
      : context.organization.currency_code;
  const totalAlerts = stock.length + (quotesResult.data?.length ?? 0) + receivables.length + payables.length;

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="bg-[#163f32] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div><p className="font-bold">{context.organization.name}</p><p className="text-xs text-white/60">Centro de alertas · {context.location.name}</p></div>
          <Link href="/" className="flex items-center gap-2"><ArrowLeft size={16} />Panel</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-7 px-6 py-9 lg:px-10">
        <div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#517064]">Seguimiento</p><h1 className="mt-2 text-4xl font-bold">Alertas operativas</h1><p className="mt-2 text-[#68766f]">{totalAlerts} asuntos requieren revisión.</p></div>
        <div className="grid gap-5 lg:grid-cols-2">
          <AlertSection title="Stock bajo" icon={Boxes} empty="El inventario está por encima de sus mínimos.">
            {stock.map((level, index) => {
              const value = level.product as { id?: string; name?: string; sku?: string } | Array<{ id?: string; name?: string; sku?: string }> | null;
              const product = Array.isArray(value) ? value[0] : value;
              return <Link href="/inventario" key={product?.id ?? index} className="flex justify-between border-b border-black/7 p-4 last:border-0"><span><strong>{product?.name ?? "Producto"}</strong><small className="block text-[#75837b]">{product?.sku ?? "Sin SKU"} · mínimo {Number(level.reorder_point)}</small></span><strong className="text-amber-700">{Number(level.quantity)}</strong></Link>;
            })}
          </AlertSection>
          <AlertSection title="Cotizaciones por vencer" icon={FileClock} empty="No hay cotizaciones próximas a vencer.">
            {(quotesResult.data ?? []).map((quote) => <Link href={`/cotizaciones/${quote.id}`} key={quote.id} className="flex justify-between border-b border-black/7 p-4 last:border-0"><span><strong>{quote.quote_number}</strong><small className="block text-[#75837b]">{quote.valid_until! < today ? "Vencida" : "Vence"} · {quote.valid_until}</small></span><strong>{currency} {Number(quote.total).toFixed(2)}</strong></Link>)}
          </AlertSection>
          <AlertSection title="Cuentas por cobrar" icon={HandCoins} empty="No hay saldos de clientes.">
            {receivables.slice(0, 10).map((customer) => <Link href={`/creditos/${customer.id}`} key={customer.id} className="flex justify-between border-b border-black/7 p-4 last:border-0"><strong>{customer.name}</strong><strong className="text-amber-700">{currency} {customer.balance.toFixed(2)}</strong></Link>)}
          </AlertSection>
          <AlertSection title="Cuentas por pagar" icon={Landmark} empty="No hay saldos de proveedores.">
            {payables.slice(0, 10).map((supplier) => <Link href={`/cuentas-por-pagar/${supplier.id}`} key={supplier.id} className="flex justify-between border-b border-black/7 p-4 last:border-0"><strong>{supplier.name}</strong><strong className="text-red-700">{currency} {supplier.balance.toFixed(2)}</strong></Link>)}
          </AlertSection>
        </div>
      </div>
    </main>
  );
}

function AlertSection({ title, icon: Icon, empty, children }: { title: string; icon: typeof AlertTriangle; empty: string; children: React.ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="overflow-hidden rounded-2xl border border-black/8 bg-white"><h2 className="flex items-center gap-2 border-b border-black/8 p-5 font-bold"><Icon size={18} />{title}</h2>{hasItems ? children : <p className="p-8 text-center text-sm text-[#75837b]">{empty}</p>}</section>;
}
