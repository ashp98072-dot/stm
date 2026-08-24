import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, ShoppingCart } from "lucide-react";
import { getOrganizationContext } from "@/lib/auth/organization";
import { cancelQuote } from "../actions";
import { PrintButton } from "./print-button";
export default async function QuoteDetail({
  params,
  searchParams,
}: PageProps<"/cotizaciones/[id]">) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const c = await getOrganizationContext();
  const [{ data: q }, { data: settings }] = await Promise.all([
    c.supabase
      .from("quotes")
      .select(
        "id,quote_number,status,subtotal,tax_total,total,notes,valid_until,created_at,converted_sale_id,customer:customers(first_name,last_name,company_name,tax_id),location:locations(name),quote_items(product_name,sku,quantity,unit_price,tax_total,line_total)",
      )
      .eq("id", id)
      .eq("organization_id", c.organization.id)
      .single(),
    c.supabase
      .from("organizations")
      .select("tax_id,address,phone")
      .eq("id", c.organization.id)
      .single(),
  ]);
  if (!q) notFound();
  const cv = q.customer as
    | {
        first_name?: string;
        last_name?: string;
        company_name?: string | null;
        tax_id?: string | null;
      }
    | Array<{
        first_name?: string;
        last_name?: string;
        company_name?: string | null;
        tax_id?: string | null;
      }>
    | null;
  const customer = Array.isArray(cv) ? cv[0] : cv;
  const lv = q.location as { name?: string } | Array<{ name?: string }> | null;
  const location = Array.isArray(lv) ? lv[0] : lv;
  const items =
    (q.quote_items as Array<{
      product_name: string;
      sku: string | null;
      quantity: string | number;
      unit_price: string | number;
      tax_total: string | number;
      line_total: string | number;
    }>) ?? [];
  const currency =
    c.organization.currency_code === "GTQ" ? "Q" : c.organization.currency_code;
  return (
    <main className="min-h-screen bg-[#eef0ec] px-5 py-10 text-[#17251f] print:bg-white print:p-0">
      <div className="mx-auto mb-5 flex max-w-2xl items-center justify-between print:hidden">
        <Link
          href="/cotizaciones"
          className="flex items-center gap-2 text-sm font-bold text-[#285645]"
        >
          <ArrowLeft size={16} />
          Cotizaciones
        </Link>
        <div className="flex gap-2">
          {q.status === "draft" && (
            <>
              <form action={cancelQuote}>
                <input type="hidden" name="quoteId" value={q.id} />
                <button className="flex h-10 items-center gap-2 rounded-lg bg-red-50 px-4 text-sm font-bold text-red-700">
                  <Ban size={16} />
                  Cancelar
                </button>
              </form>
              <Link
                href={`/ventas?quote=${q.id}`}
                className="flex h-10 items-center gap-2 rounded-lg bg-[#d7f36b] px-4 text-sm font-bold text-[#163f32]"
              >
                <ShoppingCart size={16} />
                Convertir
              </Link>
            </>
          )}
          <PrintButton />
        </div>
      </div>
      {query.cancelled && (
        <p className="mx-auto mb-5 max-w-2xl rounded-xl bg-amber-50 p-3 text-sm text-amber-800 print:hidden">
          Cotización cancelada.
        </p>
      )}
      {query.error === "cancel" && (
        <p className="mx-auto mb-5 max-w-2xl rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800 print:hidden">
          No se pudo cancelar la cotización. Puede que ya haya sido convertida o cancelada.
        </p>
      )}
      <article className="mx-auto max-w-2xl bg-white p-8 shadow-xl print:shadow-none sm:p-12">
        {q.status !== "draft" && (
          <p
            className={`mb-6 rounded-xl p-3 text-center font-black uppercase tracking-widest ${q.status === "converted" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
          >
            {q.status === "converted" ? "Convertida en venta" : "Cancelada"}
          </p>
        )}
        <header className="flex justify-between gap-6 border-b pb-6">
          <div>
            <div className="mb-3 grid size-11 place-items-center rounded-xl bg-[#163f32] font-black text-[#d7f36b]">
              S
            </div>
            <h1 className="text-2xl font-bold">{c.organization.name}</h1>
            <p className="text-sm text-[#68766f]">{location?.name}</p>
            {settings?.tax_id && (
              <p className="text-xs text-[#75837b]">NIT {settings.tax_id}</p>
            )}
            {settings?.address && (
              <p className="max-w-xs text-xs text-[#75837b]">
                {settings.address}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-[#75837b]">
              Cotización
            </p>
            <p className="mt-2 font-mono font-bold">{q.quote_number}</p>
            <p className="mt-1 text-xs text-[#75837b]">
              {new Intl.DateTimeFormat("es-GT", {
                dateStyle: "medium",
                timeZone: c.organization.timezone,
              }).format(new Date(q.created_at))}
            </p>
            {q.valid_until && (
              <p className="mt-1 text-xs">Válida hasta {q.valid_until}</p>
            )}
          </div>
        </header>
        <section className="border-b py-5 text-sm">
          <strong>Cliente</strong>
          <p className="mt-1 text-[#68766f]">
            {customer
              ? customer.company_name ||
                `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim()
              : "Consumidor final"}
            {customer?.tax_id ? ` · NIT ${customer.tax_id}` : ""}
          </p>
        </section>
        <div className="py-5">
          {items.map((item, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto_auto] gap-3 border-b py-3 text-sm"
            >
              <div>
                <strong>{item.product_name}</strong>
                <p className="text-xs text-[#75837b]">
                  {item.sku || ""} · {currency}{" "}
                  {Number(item.unit_price).toFixed(2)}
                </p>
              </div>
              <span>{Number(item.quantity)}</span>
              <strong>
                {currency} {Number(item.line_total).toFixed(2)}
              </strong>
            </div>
          ))}
        </div>
        <div className="ml-auto max-w-xs space-y-2 border-t pt-5 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>
              {currency} {Number(q.subtotal).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Impuestos</span>
            <span>
              {currency} {Number(q.tax_total).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between border-t pt-3 text-xl font-bold">
            <span>Total</span>
            <span>
              {currency} {Number(q.total).toFixed(2)}
            </span>
          </div>
        </div>
        {q.notes && (
          <p className="mt-8 whitespace-pre-line border-t border-dashed pt-5 text-sm text-[#68766f]">
            {q.notes}
          </p>
        )}
      </article>
    </main>
  );
}
