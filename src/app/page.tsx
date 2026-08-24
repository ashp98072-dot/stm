import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight, BellRing, Boxes, Building2, CalendarClock, CircleDollarSign, Download, FileText, HandCoins, History, Landmark, LogOut, PackageSearch, ReceiptText, Settings, ShoppingCart, Tags, Truck, UserCog, Users, WalletCards } from "lucide-react";
import { logout } from "@/app/login/actions";
import { getOrganizationContext } from "@/lib/auth/organization";

const modules = [
  { title: "Nueva venta", description: "Abre una venta y agrega productos al carrito.", icon: ShoppingCart, href: "/ventas" },
  { title: "Inventario", description: "Administra existencias por sucursal.", icon: Boxes, href: "/inventario" },
  { title: "Catálogos", description: "Administra categorías, fabricantes y etiquetas.", icon: Tags, href: "/inventario/catalogos" },
  { title: "Clientes", description: "Consulta y registra clientes.", icon: Users, href: "/clientes" },
  { title: "Reportes", description: "Revisa ventas, pagos y movimientos.", icon: ReceiptText, href: "/reportes" },
  { title: "Compras", description: "Recibe mercancía y administra proveedores.", icon: Truck, href: "/compras" },
  { title: "Gastos", description: "Registra y consulta gastos operativos.", icon: WalletCards, href: "/gastos" },
  { title: "Equipo", description: "Administra colaboradores, roles e invitaciones.", icon: UserCog, href: "/equipo" },
  { title: "Sucursales", description: "Cambia la ubicación de trabajo y administra sedes.", icon: Building2, href: "/sucursales" },
  { title: "Transferencias", description: "Mueve existencias de forma segura entre sucursales.", icon: ArrowLeftRight, href: "/transferencias" },
  { title: "Caja", description: "Abre, controla y cierra el efectivo del turno.", icon: Landmark, href: "/caja" },
  { title: "Créditos", description: "Consulta saldos pendientes y registra abonos.", icon: HandCoins, href: "/creditos" },
  { title: "Configuración", description: "Actualiza empresa, recibos y perfil personal.", icon: Settings, href: "/configuracion" },
  { title: "Kardex", description: "Audita entradas y salidas de inventario.", icon: History, href: "/movimientos" },
  { title: "Cotizaciones", description: "Prepara propuestas y conviértelas en ventas.", icon: FileText, href: "/cotizaciones" },
  { title: "Cuentas por pagar", description: "Controla saldos y pagos a proveedores.", icon: Landmark, href: "/cuentas-por-pagar" },
  { title: "Auditoría", description: "Revisa anulaciones, caja y operaciones sensibles.", icon: History, href: "/auditoria" },
  { title: "Exportaciones", description: "Descarga ventas, inventario y saldos en CSV.", icon: Download, href: "/exportaciones" },
  { title: "Alertas", description: "Prioriza stock, cotizaciones y saldos pendientes.", icon: BellRing, href: "/alertas" },
  { title: "Antigüedad", description: "Analiza saldos vencidos y próximos a vencer.", icon: CalendarClock, href: "/antiguedad" },
  { title: "Vencimientos", description: "Ajusta la fecha de crédito de cada documento.", icon: CalendarClock, href: "/vencimientos" },
  { title: "Devoluciones", description: "Devuelve productos y repone existencias.", icon: ArrowLeftRight, href: "/devoluciones" },
  { title: "Historial de devoluciones", description: "Consulta e imprime comprobantes de reembolso.", icon: History, href: "/devoluciones/historial" },
  { title: "Proveedores", description: "Administra contactos, saldos y límites de crédito.", icon: Truck, href: "/proveedores" },
  { title: "Historial de compras", description: "Consulta e imprime recepciones de mercancía.", icon: PackageSearch, href: "/compras/historial" },
  { title: "Valoración", description: "Consulta costo, valor de venta y margen del inventario.", icon: CircleDollarSign, href: "/inventario/valoracion" },
  { title: "Impuestos", description: "Resume débitos y créditos fiscales del período.", icon: ReceiptText, href: "/reportes/impuestos" },
  { title: "Flujo de caja", description: "Analiza entradas, salidas y neto por método.", icon: WalletCards, href: "/reportes/flujo-caja" },
  { title: "Reposición", description: "Prepara cantidades sugeridas para reabastecer stock bajo.", icon: PackageSearch, href: "/inventario/reposicion" },
  { title: "Reporte de compras", description: "Analiza inversión, proveedores y productos adquiridos.", icon: Truck, href: "/reportes/compras" },
  { title: "Devoluciones a proveedores", description: "Regresa mercancía y ajusta inventario y saldos.", icon: ArrowLeftRight, href: "/devoluciones-compras" },
  { title: "Rentabilidad", description: "Compara ingresos, costos, utilidad y margen por producto.", icon: CircleDollarSign, href: "/reportes/rentabilidad" },
  { title: "Reporte de caja", description: "Supervisa cierres, faltantes y sobrantes por turno.", icon: Landmark, href: "/reportes/caja" },
  { title: "Comparar sucursales", description: "Contrasta ventas, compras, gastos e inventario por sede.", icon: Building2, href: "/reportes/sucursales" },
  { title: "Desempeño del equipo", description: "Compara ventas, devoluciones y cierres por colaborador.", icon: Users, href: "/reportes/equipo" },
];

const moduleGroups = [
  { title: "Ventas y clientes", description: "Atención al cliente y operaciones comerciales.", paths: ["/ventas", "/clientes", "/cotizaciones", "/devoluciones", "/devoluciones/historial"] },
  { title: "Inventario", description: "Existencias, movimientos y abastecimiento interno.", paths: ["/inventario", "/inventario/catalogos", "/movimientos", "/transferencias", "/inventario/reposicion", "/inventario/valoracion"] },
  { title: "Compras y proveedores", description: "Recepciones, proveedores y obligaciones de compra.", paths: ["/compras", "/compras/historial", "/proveedores", "/devoluciones-compras", "/cuentas-por-pagar"] },
  { title: "Caja y finanzas", description: "Efectivo, créditos, gastos y vencimientos.", paths: ["/caja", "/creditos", "/gastos", "/vencimientos", "/antiguedad"] },
  { title: "Análisis y control", description: "Reportes, alertas, auditoría y exportaciones.", paths: ["/reportes", "/reportes/impuestos", "/reportes/flujo-caja", "/reportes/compras", "/reportes/rentabilidad", "/reportes/caja", "/reportes/sucursales", "/reportes/equipo", "/alertas", "/auditoria", "/exportaciones"] },
  { title: "Administración", description: "Equipo, sucursales y preferencias de la empresa.", paths: ["/equipo", "/sucursales", "/configuracion"] },
];

const restrictedPaths: Record<string, string[]> = {
  cashier: ["/ventas", "/clientes", "/cotizaciones", "/devoluciones", "/devoluciones/historial", "/caja", "/creditos", "/sucursales", "/configuracion"],
  inventory: ["/inventario", "/inventario/catalogos", "/movimientos", "/transferencias", "/inventario/reposicion", "/inventario/valoracion", "/compras", "/compras/historial", "/proveedores", "/devoluciones-compras", "/cuentas-por-pagar", "/sucursales", "/configuracion"],
  viewer: ["/clientes", "/devoluciones/historial", "/inventario", "/inventario/catalogos", "/movimientos", "/inventario/valoracion", "/compras/historial", "/proveedores", "/cuentas-por-pagar", "/creditos", "/antiguedad", "/alertas", "/auditoria", "/exportaciones", "/reportes", "/reportes/impuestos", "/reportes/flujo-caja", "/reportes/compras", "/reportes/rentabilidad", "/reportes/caja", "/reportes/sucursales", "/reportes/equipo", "/sucursales", "/configuracion"],
};

export default async function Home() {
  const { supabase, user, organization, location, role } = await getOrganizationContext();
  const organizationId = organization.id;
  const startOfToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
  const [productsResult, customersResult, salesResult, stockResult, returnsResult] = await Promise.all([
    supabase.from("products").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("active", true),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("active", true),
    supabase.from("sales").select("total").eq("organization_id", organizationId).eq("location_id", location.id).eq("status", "completed").gte("completed_at", `${startOfToday}T00:00:00-06:00`),
    supabase.from("inventory_levels").select("quantity, reorder_point").eq("organization_id", organizationId).eq("location_id", location.id),
    supabase.from("sale_returns").select("total").eq("organization_id", organizationId).eq("location_id", location.id).gte("created_at", `${startOfToday}T00:00:00-06:00`),
  ]);

  const sales = salesResult.data ?? [];
  const salesTotal = sales.reduce((sum, sale) => sum + Number(sale.total), 0) - (returnsResult.data ?? []).reduce((sum, item) => sum + Number(item.total), 0);
  const currency = organization.currency_code === "GTQ" ? "Q" : organization.currency_code;
  const metrics = [
    { label: "Ventas de hoy", value: `${currency} ${salesTotal.toFixed(2)}`, detail: `${sales.length} transacciones`, icon: CircleDollarSign },
    { label: "Productos", value: String(productsResult.count ?? 0), detail: "Productos activos", icon: Boxes },
    { label: "Clientes", value: String(customersResult.count ?? 0), detail: "Clientes activos", icon: Users },
    { label: "Stock bajo", value: String((stockResult.data ?? []).filter((level) => Number(level.quantity) <= Number(level.reorder_point)).length), detail: "Requieren atención", icon: PackageSearch },
  ];
  const accountLabel = user.email?.endsWith("@stm.internal")
    ? user.email.slice(0, -"@stm.internal".length)
    : user.email;
  const allowedPaths = restrictedPaths[role];
  const visibleModules = allowedPaths ? modules.filter((module) => allowedPaths.includes(module.href)) : role === "manager" ? modules.filter((module) => module.href !== "/equipo") : modules;
  const visibleGroups = moduleGroups.map((group) => ({ ...group, modules: group.paths.map((path) => visibleModules.find((module) => module.href === path)).filter((module): module is typeof modules[number] => Boolean(module)) })).filter((group) => group.modules.length);

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="border-b border-black/10 bg-[#163f32] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-[#d7f36b] font-black text-[#163f32]">S</div>
            <div><p className="text-lg font-bold tracking-tight">{organization.name}</p><p className="text-xs text-white/60">Punto de venta · {location.name}</p></div>
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
          <div className="mb-6 flex items-center justify-between"><div><h2 className="text-xl font-bold">Módulos</h2><p className="mt-1 text-sm text-[#708078]">Accesos disponibles para tu rol.</p></div><span className="rounded-full border border-[#bdc8c1] px-3 py-1 text-xs font-semibold text-[#617069]">{visibleModules.length} herramientas</span></div>
          <div className="space-y-8">{visibleGroups.map((group) => <section key={group.title}><div className="mb-3"><h3 className="font-bold text-[#285645]">{group.title}</h3><p className="text-sm text-[#7a8780]">{group.description}</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{group.modules.map(({ title, description, icon: Icon, href }) => <Link key={title} href={href} className="group flex items-center gap-4 rounded-2xl border border-black/8 bg-white p-4 transition hover:-translate-y-0.5 hover:border-[#7e9d91] hover:shadow-lg"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#163f32] text-[#d7f36b]"><Icon size={20}/></span><span className="min-w-0 flex-1"><span className="block font-bold">{title}</span><span className="mt-1 block text-xs leading-5 text-[#708078]">{description}</span></span><ArrowUpRight className="shrink-0 text-[#92a099] transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" size={18}/></Link>)}</div></section>)}</div>
        </section>
      </div>
    </main>
  );
}
