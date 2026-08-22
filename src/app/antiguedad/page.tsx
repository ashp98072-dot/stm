import Link from "next/link";
import { ArrowLeft, CalendarClock, HandCoins, Landmark } from "lucide-react";
import { getOrganizationContext } from "@/lib/auth/organization";

type Account = { id: string; name: string; balance: number; dueDate?: string };

export default async function AgingReportPage() {
  const context = await getOrganizationContext();
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: context.organization.timezone,
  });
  const [customersResult, customerMovementsResult, suppliersResult, supplierMovementsResult] =
    await Promise.all([
      context.supabase
        .from("customers")
        .select("id,first_name,last_name,company_name")
        .eq("organization_id", context.organization.id),
      context.supabase
        .from("customer_account_movements")
        .select("customer_id,type,amount,due_date")
        .eq("organization_id", context.organization.id),
      context.supabase
        .from("suppliers")
        .select("id,name")
        .eq("organization_id", context.organization.id),
      context.supabase
        .from("supplier_account_movements")
        .select("supplier_id,type,amount,due_date")
        .eq("organization_id", context.organization.id),
    ]);

  const customerSummary = summarizeMovements(customerMovementsResult.data ?? [], "customer_id");
  const supplierSummary = summarizeMovements(supplierMovementsResult.data ?? [], "supplier_id");
  const customers: Account[] = (customersResult.data ?? [])
    .map((customer) => ({
      id: customer.id,
      name: customer.company_name || `${customer.first_name} ${customer.last_name}`.trim(),
      balance: customerSummary.get(customer.id)?.balance ?? 0,
      dueDate: customerSummary.get(customer.id)?.dueDate,
    }))
    .filter((account) => account.balance > 0.005);
  const suppliers: Account[] = (suppliersResult.data ?? [])
    .map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      balance: supplierSummary.get(supplier.id)?.balance ?? 0,
      dueDate: supplierSummary.get(supplier.id)?.dueDate,
    }))
    .filter((account) => account.balance > 0.005);
  const currency = context.organization.currency_code === "GTQ" ? "Q" : context.organization.currency_code;

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="bg-[#163f32] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div><p className="font-bold">{context.organization.name}</p><p className="text-xs text-white/60">Antigüedad de saldos</p></div>
          <Link href="/" className="flex items-center gap-2"><ArrowLeft size={16} />Panel</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-7 px-6 py-9 lg:px-10">
        <div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#517064]">Finanzas</p><h1 className="mt-2 text-4xl font-bold">Antigüedad de saldos</h1><p className="mt-2 text-[#68766f]">Cartera ordenada por días respecto a su vencimiento.</p></div>
        <AgingSection title="Cuentas por cobrar" icon={HandCoins} accounts={customers} baseHref="/creditos" today={today} currency={currency} />
        <AgingSection title="Cuentas por pagar" icon={Landmark} accounts={suppliers} baseHref="/cuentas-por-pagar" today={today} currency={currency} />
      </div>
    </main>
  );
}

function summarizeMovements<T extends Record<K, string> & { type: string; amount: string | number; due_date?: string | null }, K extends keyof T>(movements: T[], accountKey: K) {
  const summary = new Map<string, { balance: number; dueDate?: string }>();
  for (const movement of movements) {
    const id = movement[accountKey];
    const current = summary.get(id) ?? { balance: 0 };
    current.balance += movement.type === "charge" ? Number(movement.amount) : -Number(movement.amount);
    if (movement.type === "charge" && movement.due_date && (!current.dueDate || movement.due_date < current.dueDate)) current.dueDate = movement.due_date;
    summary.set(id, current);
  }
  return summary;
}

function AgingSection({ title, icon: Icon, accounts, baseHref, today, currency }: { title: string; icon: typeof CalendarClock; accounts: Account[]; baseHref: string; today: string; currency: string }) {
  const buckets = [
    { label: "Más de 30 días vencido", min: Number.NEGATIVE_INFINITY, max: -31, tone: "text-red-800" },
    { label: "1 a 30 días vencido", min: -30, max: -1, tone: "text-red-600" },
    { label: "Vence en 7 días", min: 0, max: 7, tone: "text-amber-700" },
    { label: "Vigente", min: 8, max: Number.POSITIVE_INFINITY, tone: "text-emerald-700" },
  ];
  return <section className="overflow-hidden rounded-2xl border border-black/8 bg-white"><h2 className="flex items-center gap-2 border-b border-black/8 p-5 text-lg font-bold"><Icon size={20} />{title}</h2><div className="grid lg:grid-cols-4">{buckets.map((bucket) => { const rows = accounts.filter((account) => { const days = daysUntil(account.dueDate, today); return days >= bucket.min && days <= bucket.max; }); const total = rows.reduce((sum, account) => sum + account.balance, 0); return <div key={bucket.label} className="border-b border-black/8 lg:border-b-0 lg:border-r last:border-r-0"><div className="bg-[#f1f3ef] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#68766f]">{bucket.label}</p><strong className={`mt-1 block text-xl ${bucket.tone}`}>{currency} {total.toFixed(2)}</strong><small>{rows.length} cuentas</small></div><div className="divide-y divide-black/7">{rows.sort((a, b) => daysUntil(a.dueDate, today) - daysUntil(b.dueDate, today)).map((account) => <Link href={`${baseHref}/${account.id}`} key={account.id} className="block p-4 text-sm hover:bg-[#f7f8f5]"><strong className="block truncate">{account.name}</strong><span className="mt-1 flex justify-between text-xs text-[#75837b]"><span>{account.dueDate ?? "Sin fecha"}</span><b>{currency} {account.balance.toFixed(2)}</b></span></Link>)}{!rows.length && <p className="p-6 text-center text-xs text-[#88938e]">Sin cuentas</p>}</div></div>; })}</div></section>;
}

function daysUntil(date: string | undefined, today: string) {
  if (!date) return Number.POSITIVE_INFINITY;
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}
