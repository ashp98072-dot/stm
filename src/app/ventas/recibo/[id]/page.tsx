import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { getOrganizationContext } from "@/lib/auth/organization";
import { PrintButton } from "./print-button";
import { VoidSaleForm } from "./void-sale-form";

const paymentLabels: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", store_credit: "Crédito tienda", other: "Otro" };

export default async function ReceiptPage({ params, searchParams }: PageProps<"/ventas/recibo/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const context = await getOrganizationContext();
  const [{ data: sale }, { data: receiptSettings }] = await Promise.all([context.supabase.from("sales")
    .select("id, receipt_number, status, cashier_id, subtotal, discount_total, tax_total, total, completed_at, location:locations(name), customer:customers(first_name, last_name, company_name, tax_id), sale_items(product_name, sku, quantity, unit_price, discount_total, tax_total, line_total), payments(method, amount, reference), sale_voids(reason, voided_at)")
    .eq("id", id).eq("organization_id", context.organization.id).single(), context.supabase.from("organizations").select("tax_id, address, phone, receipt_footer").eq("id", context.organization.id).single()]);
  if (!sale) notFound();

  const customerValue = sale.customer as { first_name?: string; last_name?: string; company_name?: string | null; tax_id?: string | null } | Array<{ first_name?: string; last_name?: string; company_name?: string | null; tax_id?: string | null }> | null;
  const customer = Array.isArray(customerValue) ? customerValue[0] : customerValue;
  const locationValue = sale.location as { name?: string } | Array<{ name?: string }> | null;
  const saleLocation = Array.isArray(locationValue) ? locationValue[0] : locationValue;
  const items = (sale.sale_items ?? []) as Array<{ product_name: string; sku: string | null; quantity: number | string; unit_price: number | string; tax_total: number | string; line_total: number | string }>;
  const payments = (sale.payments ?? []) as Array<{ method: string; amount: number | string; reference: string | null }>;
  const voidValue = sale.sale_voids as { reason?: string; voided_at?: string } | Array<{ reason?: string; voided_at?: string }> | null;
  const saleVoid = Array.isArray(voidValue) ? voidValue[0] : voidValue;
  const canVoid = sale.status === "completed" && (["owner", "admin", "manager"].includes(context.role) || (context.role === "cashier" && sale.cashier_id === context.user.id));
  const currency = context.organization.currency_code === "GTQ" ? "Q" : context.organization.currency_code;
  const date = new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short", timeZone: context.organization.timezone }).format(new Date(sale.completed_at));

  return (
    <main className="min-h-screen bg-[#eef0ec] px-5 py-10 text-[#17251f] print:bg-white print:p-0">
      <div className="mx-auto mb-5 flex max-w-2xl items-center justify-between print:hidden"><Link href="/ventas" className="flex items-center gap-2 text-sm font-bold text-[#285645]"><ArrowLeft size={16} /> Nueva venta</Link><div className="flex gap-2">{canVoid && <VoidSaleForm saleId={sale.id} />}<PrintButton /></div></div>
      {query.voided && <p className="mx-auto mb-5 max-w-2xl rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 print:hidden">Venta anulada y existencias restauradas.</p>}{query.error && <p className="mx-auto mb-5 max-w-2xl rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 print:hidden">No fue posible anular esta venta.</p>}
      <article className="mx-auto max-w-2xl bg-white p-8 shadow-[0_20px_60px_rgba(26,52,42,0.12)] print:shadow-none sm:p-12">
        {sale.status === "voided" && <div className="mb-7 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-center text-red-800"><p className="text-xl font-black uppercase tracking-widest">Venta anulada</p><p className="mt-1 text-sm">{saleVoid?.reason}</p></div>}
        <div className="flex items-start justify-between gap-6 border-b border-black/10 pb-7"><div><div className="mb-4 grid size-11 place-items-center rounded-xl bg-[#163f32] font-black text-[#d7f36b]">S</div><h1 className="text-2xl font-bold">{context.organization.name}</h1><p className="mt-1 text-sm text-[#6b7971]">{saleLocation?.name ?? context.location.name}</p>{receiptSettings?.tax_id && <p className="mt-1 text-xs text-[#6b7971]">NIT {receiptSettings.tax_id}</p>}{receiptSettings?.address && <p className="mt-1 max-w-xs text-xs text-[#6b7971]">{receiptSettings.address}</p>}{receiptSettings?.phone && <p className="mt-1 text-xs text-[#6b7971]">Tel. {receiptSettings.phone}</p>}</div><div className="text-right"><CheckCircle2 className="ml-auto text-emerald-600" /><p className="mt-3 font-mono font-bold">{sale.receipt_number}</p><p className="mt-1 text-xs text-[#6b7971]">{date}</p></div></div>
        <div className="border-b border-black/10 py-5 text-sm"><p className="font-bold">Cliente</p><p className="mt-1 text-[#617067]">{customer ? customer.company_name || `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() : "Consumidor final"}{customer?.tax_id ? ` · NIT ${customer.tax_id}` : ""}</p></div>
        <div className="py-5"><div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-black/10 pb-2 text-xs font-bold uppercase tracking-wider text-[#6b7971]"><span>Producto</span><span>Cant.</span><span>Total</span></div>{items.map((item, index) => <div key={`${item.product_name}-${index}`} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-black/6 py-3 text-sm"><div><p className="font-semibold">{item.product_name}</p><p className="text-xs text-[#77847d]">{item.sku || ""} · {currency} {Number(item.unit_price).toFixed(2)}</p></div><span>{Number(item.quantity)}</span><span className="min-w-24 text-right font-bold">{currency} {Number(item.line_total).toFixed(2)}</span></div>)}</div>
        <div className="ml-auto max-w-xs space-y-2 border-t border-black/10 pt-5 text-sm"><div className="flex justify-between text-[#68766f]"><span>Subtotal</span><span>{currency} {Number(sale.subtotal).toFixed(2)}</span></div>{Number(sale.discount_total) > 0 && <div className="flex justify-between font-semibold text-emerald-700"><span>Descuento</span><span>− {currency} {Number(sale.discount_total).toFixed(2)}</span></div>}<div className="flex justify-between text-[#68766f]"><span>Impuestos</span><span>{currency} {Number(sale.tax_total).toFixed(2)}</span></div><div className="flex justify-between border-t border-black/10 pt-3 text-xl font-bold"><span>Total</span><span>{currency} {Number(sale.total).toFixed(2)}</span></div>{payments.map((payment, index) => <div key={index} className="flex justify-between pt-2 text-[#506159]"><span>{paymentLabels[payment.method] || payment.method}</span><span>{currency} {Number(payment.amount).toFixed(2)}</span></div>)}</div>
        <p className="mt-10 whitespace-pre-line border-t border-dashed border-black/15 pt-6 text-center text-sm text-[#75827b]">{receiptSettings?.receipt_footer ?? "Gracias por su compra."}</p>
      </article>
    </main>
  );
}
