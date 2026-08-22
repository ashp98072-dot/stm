import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Boxes, CircleDollarSign, LogOut, PackageSearch, ReceiptText, ShoppingCart, Truck, Users, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/login/actions";

const modules = [
  { title: "Nueva venta", description: "Abre una venta y agrega productos al carrito.", icon: ShoppingCart, href: "/ventas" },
  { title: "Inventario", description: "Administra existencias por sucursal.", icon: Boxes, href: "/inventario" },
  { title: "Clientes", description: "Consulta y registra clientes.", icon: Users, href: "/clientes" },
  { title: "Reportes", description: "Revisa ventas, pagos y movimientos.", icon: ReceiptText, href: "/reportes" },
  { title: "Compras", description: "Recibe mercancía y administra proveedores.", icon: Truck, href: "/compras" },
  { title: "Gastos", description: "Registra y consulta gastos operativos.", icon: WalletCards, href: "/gastos" },
];

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/onboarding");

  const organizationId = membership.organization_id;
  const startOfToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
  const [organizationResult, productsResult, customersResult, salesResult, stockResult] = await Promise.all([
    supabase.from("organizations").select("name, currency_code").eq("id", organizationId).single(),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("active", true),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("active", true),
    supabase.from("sales").select("total").eq("organization_id", organizationId).eq("status", "completed").gte("completed_at", `${startOfToday}T00:00:00-06:00`),
    supabase.from("inventory_levels").select("product_id", { count: "exact", head: true }).eq("organization_id", organizationId).lt("quantity", 1),
  ]);

  const sales = salesResult.data ?? [];
  const salesTotal = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const currency = organizationResult.data?.currency_code === "GTQ" ? "Q" : organizationResult.data?.currency_code ?? "GTQ";
  const metrics = [
    { label: "Ventas de hoy", value: `${currency} ${salesTotal.toFixed(2)}`, detail: `${sales.length} transacciones`, icon: CircleDollarSign },
    { label: "Productos", value: String(productsResult.count ?? 0), detail: "Productos activos", icon: Boxes },
    { label: "Clientes", value: String(customersResult.count ?? 0), detail: "Clientes activos", icon: Users },
    { label: "Stock bajo", value: String(stockResult.count ?? 0), detail: "Requieren atención", icon: PackageSearch },
  ];
  const accountLabel = user.email?.endsWith("@stm.internal")
    ? user.email.slice(0, -"@stm.internal".length)
    : user.email;

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="border-b border-black/10 bg-[#163f32] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#d7f36b] font-black text-[#163f32]">S</div>
            <div><p className="text-lg font-bold tracking-tight">{organizationResult.data?.name ?? "STM"}</p><p className="text-xs text-white/60">Punto de venta</p></div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden max-w-48 truncate text-white/65 sm:inline">{accountLabel}</span>
            <form action={logout}><button title="Cerrar sesión" className="grid size-9 cursor-pointer place-items-center rounded-full bg-white/10 transition hover:bg-white/20"><LogOut size={16} /></button></form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#517064]">Panel general</p>
            <h1 className="text-4xl font-bold tracking-[-0.04em] sm:text-5xl">Buenos días.</h1>
            <p className="mt-3 max-w-xl text-[#617069]">La nueva plataforma está lista para conectarse a Supabase e importar la información del sistema anterior.</p>
          </div>
          <Link href="/ventas" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#d7f36b] px-5 font-bold text-[#163f32] transition hover:-translate-y-0.5 hover:shadow-lg"><ShoppingCart size={18} /> Nueva venta</Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, detail, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-black/8 bg-white p-5 shadow-[0_12px_35px_rgba(26,52,42,0.05)]">
              <div className="mb-7 flex items-center justify-between"><span className="text-sm font-medium text-[#617069]">{label}</span><span className="grid size-9 place-items-center rounded-lg bg-[#e9eee8] text-[#285645]"><Icon size={18} /></span></div>
              <p className="text-3xl font-bold tracking-tight">{value}</p><p className="mt-1 text-sm text-[#829088]">{detail}</p>
            </article>
          ))}
        </section>

        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Accesos rápidos</h2><span className="rounded-full border border-[#bdc8c1] px-3 py-1 text-xs font-semibold text-[#617069]">MVP · Fase 1</span></div>
          <div className="grid gap-4 md:grid-cols-2">
            {modules.map(({ title, description, icon: Icon, href }) => (
              <Link key={title} href={href} className="group flex items-center gap-5 rounded-2xl border border-black/8 bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#7e9d91] hover:shadow-lg">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#163f32] text-[#d7f36b]"><Icon size={22} /></span>
                <span className="min-w-0 flex-1"><span className="block font-bold">{title}</span><span className="mt-1 block text-sm text-[#708078]">{description}</span></span>
                <ArrowUpRight className="text-[#92a099] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" size={20} />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
