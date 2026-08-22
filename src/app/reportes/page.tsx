import Link from "next/link";
import { ArrowLeft, Banknote, CalendarDays, ChartNoAxesCombined, CreditCard, ReceiptText, ShoppingBag, TrendingDown, TrendingUp } from "lucide-react";
import { canViewReports, getOrganizationContext } from "@/lib/auth/organization";

const paymentLabels: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", store_credit: "Crédito tienda", other: "Otro" };
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({ searchParams }: PageProps<"/reportes">) {
  const context = await getOrganizationContext();
  const params = await searchParams;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
  const from = typeof params.from === "string" && datePattern.test(params.from) ? params.from : today;
  const to = typeof params.to === "string" && datePattern.test(params.to) ? params.to : today;
  const allowed = canViewReports(context.role);
  const currency = context.organization.currency_code === "GTQ" ? "Q" : context.organization.currency_code;

  if (!allowed) return <AccessDenied organizationName={context.organization.name} />;

  const [{ data: sales, error }, { data: expenses }, { data: returns }] = await Promise.all([
    context.supabase.from("sales")
      .select("id, receipt_number, subtotal, tax_total, total, completed_at, customer:customers(first_name, last_name, company_name), payments(method, amount)")
      .eq("organization_id", context.organization.id).eq("location_id", context.location.id).eq("status", "completed")
      .gte("completed_at", `${from}T00:00:00-06:00`).lte("completed_at", `${to}T23:59:59.999-06:00`)
      .order("completed_at", { ascending: false }).limit(500),
    context.supabase.from("expenses").select("total, category:expense_categories(name)")
      .eq("organization_id", context.organization.id).eq("location_id", context.location.id).eq("status", "posted")
      .gte("incurred_at", `${from}T00:00:00-06:00`).lte("incurred_at", `${to}T23:59:59.999-06:00`),
    context.supabase.from("sale_returns").select("id,total,refund_method")
      .eq("organization_id", context.organization.id).eq("location_id", context.location.id)
      .gte("created_at", `${from}T00:00:00-06:00`).lte("created_at", `${to}T23:59:59.999-06:00`),
  ]);
  if (error) throw new Error("No se pudieron cargar los reportes.");

  const saleRows = sales ?? [];
  const returnsTotal = (returns ?? []).reduce((sum, item) => sum + Number(item.total), 0);
  const total = saleRows.reduce((sum, sale) => sum + Number(sale.total), 0) - returnsTotal;
  const taxes = saleRows.reduce((sum, sale) => sum + Number(sale.tax_total), 0);
  const average = saleRows.length ? total / saleRows.length : 0;
  const paymentTotals = new Map<string, number>();
  saleRows.forEach((sale) => ((sale.payments ?? []) as Array<{ method: string; amount: string | number }>).forEach((payment) => paymentTotals.set(payment.method, (paymentTotals.get(payment.method) ?? 0) + Number(payment.amount))));
  (returns ?? []).forEach((item) => paymentTotals.set(item.refund_method, (paymentTotals.get(item.refund_method) ?? 0) - Number(item.total)));

  let saleItems: Array<{ product_name: string; quantity: string | number; line_total: string | number; unit_price: string | number; unit_cost: string | number; discount_total: string | number }> = [];
  if (saleRows.length) {
    const { data } = await context.supabase.from("sale_items").select("product_name, quantity, line_total, unit_price, unit_cost, discount_total").eq("organization_id", context.organization.id).in("sale_id", saleRows.map((sale) => sale.id));
    saleItems = data ?? [];
  }
  let returnedMargin = 0;
  if (returns?.length) {
    const { data: returnedItems } = await context.supabase.from("sale_return_items")
      .select("amount,quantity,sale_item:sale_items(line_total,tax_total,unit_cost)")
      .in("return_id", returns.map((item) => item.id));
    returnedMargin = (returnedItems ?? []).reduce((sum, item) => {
      const value = item.sale_item as { line_total?: string | number; tax_total?: string | number; unit_cost?: string | number } | Array<{ line_total?: string | number; tax_total?: string | number; unit_cost?: string | number }> | null;
      const line = Array.isArray(value) ? value[0] : value;
      const lineTotal = Number(line?.line_total ?? 0);
      const revenueWithoutTax = lineTotal ? Number(item.amount) * (lineTotal - Number(line?.tax_total ?? 0)) / lineTotal : Number(item.amount);
      return sum + revenueWithoutTax - Number(line?.unit_cost ?? 0) * Number(item.quantity);
    }, 0);
  }
  const productTotals = new Map<string, { quantity: number; total: number }>();
  saleItems.forEach((item) => {
    const current = productTotals.get(item.product_name) ?? { quantity: 0, total: 0 };
    productTotals.set(item.product_name, { quantity: current.quantity + Number(item.quantity), total: current.total + Number(item.line_total) });
  });
  const topProducts = [...productTotals.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);
  const grossProfit = saleItems.reduce((sum, item) => sum + (Number(item.unit_price) - Number(item.unit_cost)) * Number(item.quantity) - Number(item.discount_total), 0) - returnedMargin;
  const expenseRows = expenses ?? [];
  const expenseTotal = expenseRows.reduce((sum, expense) => sum + Number(expense.total), 0);
  const operatingResult = grossProfit - expenseTotal;
  const expenseCategories = new Map<string, number>();
  expenseRows.forEach((expense) => {
    const value = expense.category as { name?: string } | Array<{ name?: string }> | null;
    const name = (Array.isArray(value) ? value[0]?.name : value?.name) || "Sin categoría";
    expenseCategories.set(name, (expenseCategories.get(name) ?? 0) + Number(expense.total));
  });

  const metrics = [
    { label: "Ventas netas", value: `${currency} ${total.toFixed(2)}`, detail: `${saleRows.length} transacciones`, icon: ChartNoAxesCombined },
    { label: "Ticket promedio", value: `${currency} ${average.toFixed(2)}`, detail: "Neto por transacción", icon: ReceiptText },
    { label: "Devoluciones", value: `${currency} ${returnsTotal.toFixed(2)}`, detail: `${returns?.length ?? 0} operaciones`, icon: TrendingDown },
    { label: "Impuestos", value: `${currency} ${taxes.toFixed(2)}`, detail: "Total recaudado", icon: Banknote },
    { label: "Unidades vendidas", value: saleItems.reduce((sum, item) => sum + Number(item.quantity), 0).toFixed(3).replace(/\.000$/, ""), detail: `${productTotals.size} productos`, icon: ShoppingBag },
    { label: "Utilidad bruta", value: `${currency} ${grossProfit.toFixed(2)}`, detail: "Ventas menos costo", icon: TrendingUp },
    { label: "Resultado operativo", value: `${currency} ${operatingResult.toFixed(2)}`, detail: `${currency} ${expenseTotal.toFixed(2)} en gastos`, icon: TrendingDown },
  ];

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="bg-[#163f32] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><div><p className="text-lg font-bold">{context.organization.name}</p><p className="text-xs text-white/60">Reportes de ventas</p></div><Link href="/" className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"><ArrowLeft size={16} /> Panel</Link></div></header>
      <div className="mx-auto max-w-7xl px-6 py-9 lg:px-10">
        <div className="mb-7 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">Análisis</p><h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">Reporte de ventas</h1><p className="mt-2 text-[#68766f]">Hasta 500 transacciones por consulta.</p></div><form className="flex flex-wrap items-end gap-2 rounded-2xl border border-black/8 bg-white p-3"><DateField label="Desde" name="from" value={from} /><DateField label="Hasta" name="to" value={to} /><button className="h-10 rounded-lg bg-[#163f32] px-4 text-sm font-bold text-white">Aplicar</button></form></div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(({ label, value, detail, icon: Icon }) => <article key={label} className="rounded-2xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(26,52,42,0.05)]"><div className="mb-6 flex items-center justify-between"><span className="text-sm font-medium text-[#617069]">{label}</span><span className="grid size-9 place-items-center rounded-lg bg-[#e9eee8] text-[#285645]"><Icon size={18} /></span></div><p className="text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-sm text-[#829088]">{detail}</p></article>)}</section>

        <div className="mt-7 grid gap-5 lg:grid-cols-3">
          <section className="rounded-2xl border border-black/8 bg-white p-5"><h2 className="flex items-center gap-2 font-bold"><CreditCard size={18} className="text-[#39705b]" /> Métodos de pago</h2><div className="mt-5 space-y-3">{!paymentTotals.size && <p className="text-sm text-[#748179]">Sin pagos en este período.</p>}{[...paymentTotals.entries()].sort((a, b) => b[1] - a[1]).map(([method, amount]) => <div key={method} className="flex items-center justify-between border-b border-black/7 pb-3 text-sm last:border-0"><span>{paymentLabels[method] ?? method}</span><span className="font-bold">{currency} {amount.toFixed(2)}</span></div>)}</div></section>
          <section className="rounded-2xl border border-black/8 bg-white p-5"><h2 className="flex items-center gap-2 font-bold"><ShoppingBag size={18} className="text-[#39705b]" /> Productos destacados</h2><div className="mt-5 space-y-3">{!topProducts.length && <p className="text-sm text-[#748179]">Sin productos vendidos en este período.</p>}{topProducts.map(([name, values], index) => <div key={name} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 border-b border-black/7 pb-3 text-sm last:border-0"><span className="font-bold text-[#8a968f]">{index + 1}</span><div><p className="font-semibold">{name}</p><p className="text-xs text-[#7b8780]">{values.quantity} unidades</p></div><span className="font-bold">{currency} {values.total.toFixed(2)}</span></div>)}</div></section>
          <section className="rounded-2xl border border-black/8 bg-white p-5"><h2 className="flex items-center gap-2 font-bold"><TrendingDown size={18} className="text-[#39705b]" /> Gastos operativos</h2><div className="mt-5 space-y-3">{!expenseCategories.size && <p className="text-sm text-[#748179]">Sin gastos en este período.</p>}{[...expenseCategories.entries()].sort((a,b) => b[1] - a[1]).map(([name, amount]) => <div key={name} className="flex justify-between border-b border-black/7 pb-3 text-sm last:border-0"><span>{name}</span><span className="font-bold">{currency} {amount.toFixed(2)}</span></div>)}</div></section>
        </div>

        <section className="mt-7 overflow-hidden rounded-2xl border border-black/8 bg-white"><div className="border-b border-black/8 px-5 py-4"><h2 className="font-bold">Transacciones</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#edf0eb] text-xs uppercase tracking-wider text-[#607067]"><tr><th className="px-5 py-3">Recibo</th><th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Pago</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody>{!saleRows.length && <tr><td colSpan={5} className="px-5 py-14 text-center text-[#748179]">No hay ventas en el rango seleccionado.</td></tr>}{saleRows.map((sale) => { const customerValue = sale.customer as { first_name?: string; last_name?: string; company_name?: string | null } | Array<{ first_name?: string; last_name?: string; company_name?: string | null }> | null; const customer = Array.isArray(customerValue) ? customerValue[0] : customerValue; const payments = (sale.payments ?? []) as Array<{ method: string }>; return <tr key={sale.id} className="border-t border-black/7"><td className="px-5 py-4"><Link href={`/ventas/recibo/${sale.id}`} className="font-mono font-bold text-[#285645] hover:underline">{sale.receipt_number}</Link></td><td className="px-5 py-4 text-[#617067]">{new Intl.DateTimeFormat("es-GT", { dateStyle: "short", timeStyle: "short", timeZone: "America/Guatemala" }).format(new Date(sale.completed_at))}</td><td className="px-5 py-4">{customer ? customer.company_name || `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() : "Consumidor final"}</td><td className="px-5 py-4">{payments.map((payment) => paymentLabels[payment.method] ?? payment.method).join(", ")}</td><td className="px-5 py-4 text-right font-bold">{currency} {Number(sale.total).toFixed(2)}</td></tr>; })}</tbody></table></div></section>
      </div>
    </main>
  );
}

function DateField({ label, name, value }: { label: string; name: string; value: string }) {
  return <label><span className="mb-1 block text-xs font-semibold text-[#617067]">{label}</span><span className="flex h-10 items-center gap-2 rounded-lg border border-black/10 px-2"><CalendarDays size={15} className="text-[#718078]" /><input type="date" name={name} defaultValue={value} className="bg-transparent text-sm outline-none" /></span></label>;
}

function AccessDenied({ organizationName }: { organizationName: string }) {
  return <main className="grid min-h-screen place-items-center bg-[#f4f5f1] px-6"><div className="max-w-md rounded-2xl bg-white p-8 text-center"><h1 className="text-xl font-bold">Reportes restringidos</h1><p className="mt-2 text-sm text-[#68766f]">Tu rol en {organizationName} no permite consultar reportes.</p><Link href="/" className="mt-5 inline-flex rounded-lg bg-[#163f32] px-4 py-2 text-sm font-bold text-white">Volver al panel</Link></div></main>;
}
