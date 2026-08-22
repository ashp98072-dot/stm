"use client";

import { useActionState, useMemo, useState } from "react";
import { Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { completeSale, type SaleActionState } from "./actions";

type Product = { id: string; name: string; sku: string | null; barcode: string | null; price: number; taxRate: number; quantity: number };
type Customer = { id: string; name: string; taxId: string | null };
type CartLine = Product & { cartQuantity: number };
const initialState: SaleActionState = { message: "" };

export function SaleTerminal({ products, customers, currency }: { products: Product[]; customers: Customer[]; currency: string }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [received, setReceived] = useState("");
  const [discountType, setDiscountType] = useState<"none" | "percent" | "fixed">("none");
  const [discountValue, setDiscountValue] = useState("");
  const [state, action, pending] = useActionState(completeSale, initialState);

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    if (!term) return products;
    return products.filter((product) => [product.name, product.sku, product.barcode].some((value) => value?.toLowerCase().includes(term)));
  }, [products, query]);
  const add = (product: Product) => setCart((current) => {
    const line = current.find((item) => item.id === product.id);
    if (line) return current.map((item) => item.id === product.id ? { ...item, cartQuantity: Math.min(item.cartQuantity + 1, item.quantity) } : item);
    return product.quantity > 0 ? [...current, { ...product, cartQuantity: 1 }] : current;
  });
  const changeQuantity = (id: string, delta: number) => setCart((current) => current.map((item) => item.id === id ? { ...item, cartQuantity: Math.max(1, Math.min(item.cartQuantity + delta, item.quantity)) } : item));
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.cartQuantity, 0);
  const requestedDiscount = discountType === "percent" ? subtotal * Math.min(100, Number(discountValue) || 0) / 100 : discountType === "fixed" ? Number(discountValue) || 0 : 0;
  const discount = Math.min(subtotal, requestedDiscount);
  const tax = cart.reduce((sum, item) => { const base = item.price * item.cartQuantity; const lineDiscount = subtotal ? base * discount / subtotal : 0; return sum + (base - lineDiscount) * item.taxRate; }, 0);
  const total = subtotal - discount + tax;
  const change = paymentMethod === "cash" && received ? Math.max(0, Number(received) - total) : 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section>
        <div className="mb-4 flex h-12 items-center gap-3 rounded-xl border border-black/10 bg-white px-4"><Search size={19} className="text-[#728078]" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent outline-none" placeholder="Buscar producto, SKU o escanear código" autoFocus /></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product) => (
            <button key={product.id} onClick={() => add(product)} disabled={product.quantity <= 0} className="rounded-2xl border border-black/8 bg-white p-4 text-left shadow-[0_8px_25px_rgba(26,52,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#789589] disabled:cursor-not-allowed disabled:opacity-45">
              <p className="font-bold">{product.name}</p><p className="mt-1 text-xs text-[#76847c]">{product.sku || product.barcode || "Sin código"}</p>
              <div className="mt-5 flex items-end justify-between"><span className="text-lg font-bold">{currency} {product.price.toFixed(2)}</span><span className={`text-xs font-semibold ${product.quantity > 0 ? "text-[#39705b]" : "text-red-700"}`}>Stock {product.quantity}</span></div>
            </button>
          ))}
          {!filtered.length && <div className="col-span-full py-16 text-center text-[#718078]">No se encontraron productos disponibles.</div>}
        </div>
      </section>

      <aside className="h-fit rounded-2xl border border-black/8 bg-white shadow-[0_16px_45px_rgba(26,52,42,0.08)] xl:sticky xl:top-6">
        <div className="flex items-center gap-3 border-b border-black/8 p-5"><span className="grid size-10 place-items-center rounded-xl bg-[#163f32] text-[#d7f36b]"><ShoppingCart size={20} /></span><div><h2 className="font-bold">Venta actual</h2><p className="text-xs text-[#728078]">{cart.length} productos diferentes</p></div></div>
        <div className="max-h-[340px] divide-y divide-black/8 overflow-y-auto">
          {!cart.length && <p className="px-5 py-12 text-center text-sm text-[#7a8880]">Selecciona productos del catálogo.</p>}
          {cart.map((item) => <div key={item.id} className="p-4"><div className="flex justify-between gap-3"><div><p className="text-sm font-bold">{item.name}</p><p className="text-xs text-[#75837b]">{currency} {item.price.toFixed(2)} c/u</p></div><button onClick={() => setCart((current) => current.filter((line) => line.id !== item.id))} aria-label={`Quitar ${item.name}`} className="text-red-700"><Trash2 size={16} /></button></div><div className="mt-3 flex items-center justify-between"><div className="flex items-center rounded-lg border border-black/10"><button onClick={() => changeQuantity(item.id, -1)} className="p-2"><Minus size={14} /></button><span className="min-w-9 text-center text-sm font-bold">{item.cartQuantity}</span><button onClick={() => changeQuantity(item.id, 1)} className="p-2"><Plus size={14} /></button></div><span className="font-bold">{currency} {(item.price * item.cartQuantity * (1 + item.taxRate)).toFixed(2)}</span></div></div>)}
        </div>
        <form action={action} className="space-y-4 border-t border-black/8 p-5">
          <input type="hidden" name="items" value={JSON.stringify(cart.map((item) => ({ product_id: item.id, quantity: item.cartQuantity })))} />
          <input type="hidden" name="discountType" value={discountType} />
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#617067]">Cliente</span><select name="customerId" className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 outline-none"><option value="">Consumidor final</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.taxId ? ` · ${customer.taxId}` : ""}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-xs font-semibold text-[#617067]">Método</span><select name="paymentMethod" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3"><option value="cash">Efectivo</option><option value="card">Tarjeta</option><option value="transfer">Transferencia</option><option value="store_credit">Crédito tienda</option><option value="other">Otro</option></select></label><label><span className="mb-1.5 block text-xs font-semibold text-[#617067]">Recibido</span><input name="amountReceived" type="number" min="0" step="0.01" value={received} onChange={(event) => setReceived(event.target.value)} disabled={paymentMethod !== "cash"} className="h-11 w-full rounded-xl border border-black/10 px-3 disabled:bg-[#eef0ec]" placeholder={total.toFixed(2)} /></label></div>
          <div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-xs font-semibold text-[#617067]">Descuento</span><select value={discountType} onChange={(event) => { setDiscountType(event.target.value as typeof discountType); if (event.target.value === "none") setDiscountValue(""); }} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3"><option value="none">Sin descuento</option><option value="percent">Porcentaje</option><option value="fixed">Monto fijo</option></select></label><label><span className="mb-1.5 block text-xs font-semibold text-[#617067]">Valor</span><input name="discountValue" type="number" min="0" max={discountType === "percent" ? 100 : undefined} step="0.01" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} disabled={discountType === "none"} className="h-11 w-full rounded-xl border border-black/10 px-3 disabled:bg-[#eef0ec]" placeholder={discountType === "percent" ? "%" : currency} /></label></div>
          <div className="space-y-2 border-t border-dashed border-black/15 pt-4 text-sm"><div className="flex justify-between text-[#65746c]"><span>Subtotal</span><span>{currency} {subtotal.toFixed(2)}</span></div>{discount > 0 && <div className="flex justify-between font-semibold text-emerald-700"><span>Descuento</span><span>− {currency} {discount.toFixed(2)}</span></div>}<div className="flex justify-between text-[#65746c]"><span>Impuestos</span><span>{currency} {tax.toFixed(2)}</span></div><div className="flex justify-between text-xl font-bold"><span>Total</span><span>{currency} {total.toFixed(2)}</span></div>{change > 0 && <div className="flex justify-between font-bold text-[#39705b]"><span>Cambio</span><span>{currency} {change.toFixed(2)}</span></div>}</div>
          {state.message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.message}</p>}
          <button disabled={pending || !cart.length || discount >= subtotal} className="h-12 w-full rounded-xl bg-[#d7f36b] font-bold text-[#163f32] transition hover:-translate-y-0.5 disabled:opacity-50">{pending ? "Procesando…" : `Cobrar ${currency} ${total.toFixed(2)}`}</button>
        </form>
      </aside>
    </div>
  );
}
