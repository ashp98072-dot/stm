import Link from "next/link";
import { ArrowLeft, CalendarCog, CheckCircle2 } from "lucide-react";
import { getOrganizationContext } from "@/lib/auth/organization";
import { updateDueDate } from "./actions";

export default async function DueDatesPage({ searchParams }: PageProps<"/vencimientos">) {
  const context = await getOrganizationContext();
  const params = await searchParams;
  const canEdit = ["owner", "admin", "manager"].includes(context.role);
  const [{ data: customerCharges }, { data: supplierCharges }] = await Promise.all([
    context.supabase
      .from("customer_account_movements")
      .select("id,amount,due_date,created_at,sale:sales(receipt_number),customer:customers(first_name,last_name,company_name)")
      .eq("organization_id", context.organization.id)
      .eq("type", "charge")
      .order("due_date")
      .limit(100),
    context.supabase
      .from("supplier_account_movements")
      .select("id,amount,due_date,created_at,purchase:purchases(reference),supplier:suppliers(name)")
      .eq("organization_id", context.organization.id)
      .eq("type", "charge")
      .order("due_date")
      .limit(100),
  ]);
  const currency = context.organization.currency_code === "GTQ" ? "Q" : context.organization.currency_code;
  return <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]"><header className="bg-[#163f32] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10"><div><p className="font-bold">{context.organization.name}</p><p className="text-xs text-white/60">Gestión de vencimientos</p></div><Link href="/" className="flex items-center gap-2"><ArrowLeft size={16} />Panel</Link></div></header><div className="mx-auto max-w-7xl space-y-7 px-6 py-9 lg:px-10"><div><p className="text-sm font-bold uppercase tracking-[.18em] text-[#517064]">Finanzas</p><h1 className="mt-2 text-4xl font-bold">Fechas por documento</h1><p className="mt-2 text-[#68766f]">Ajusta excepciones sin cambiar los plazos generales.</p></div>{params.saved && <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-700"><CheckCircle2 size={18} />Fecha actualizada.</p>}{params.error && <p className="rounded-xl bg-red-50 p-3 font-semibold text-red-700">No fue posible actualizar la fecha.</p>}<div className="grid gap-6 lg:grid-cols-2"><DocumentList title="Ventas a crédito" type="customer" rows={(customerCharges ?? []).map((row) => { const customer = one(row.customer) as { first_name?: string; last_name?: string; company_name?: string | null } | null; const sale = one(row.sale) as { receipt_number?: string } | null; return { id: row.id, name: customer?.company_name || `${customer?.first_name ?? ""} ${customer?.last_name ?? ""}`.trim() || "Cliente", reference: sale?.receipt_number ?? "Venta", amount: Number(row.amount), dueDate: row.due_date }; })} currency={currency} canEdit={canEdit} /><DocumentList title="Compras a crédito" type="supplier" rows={(supplierCharges ?? []).map((row) => { const supplier = one(row.supplier) as { name?: string } | null; const purchase = one(row.purchase) as { reference?: string | null } | null; return { id: row.id, name: supplier?.name ?? "Proveedor", reference: purchase?.reference ?? "Compra", amount: Number(row.amount), dueDate: row.due_date }; })} currency={currency} canEdit={canEdit} /></div></div></main>;
}

function DocumentList({ title, type, rows, currency, canEdit }: { title: string; type: "customer" | "supplier"; rows: Array<{ id: string; name: string; reference: string; amount: number; dueDate: string | null }>; currency: string; canEdit: boolean }) {
  return <section className="overflow-hidden rounded-2xl border border-black/8 bg-white"><h2 className="flex items-center gap-2 border-b border-black/8 p-5 font-bold"><CalendarCog size={18} />{title}</h2><div className="divide-y divide-black/7">{rows.map((row) => <form action={updateDueDate} key={row.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end"><input type="hidden" name="type" value={type} /><input type="hidden" name="movementId" value={row.id} /><div><strong>{row.name}</strong><p className="text-xs text-[#75837b]">{row.reference} · {currency} {row.amount.toFixed(2)}</p></div><div className="flex gap-2"><input name="dueDate" type="date" defaultValue={row.dueDate ?? ""} required disabled={!canEdit} className="h-10 rounded-lg border border-black/10 px-3" /><button disabled={!canEdit} className="h-10 rounded-lg bg-[#163f32] px-4 text-sm font-bold text-white disabled:opacity-40">Guardar</button></div></form>)}{!rows.length && <p className="p-10 text-center text-sm text-[#75837b]">No hay cargos a crédito.</p>}</div></section>;
}

function one(value: unknown) { return Array.isArray(value) ? value[0] ?? null : value; }
