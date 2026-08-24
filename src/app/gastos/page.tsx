import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  WalletCards,
} from "lucide-react";
import {
  canManageExpenses,
  canViewReports,
  getOrganizationContext,
} from "@/lib/auth/organization";
import { ExpenseForm } from "./expense-form";
import { VoidExpenseButton } from "./void-expense-button";
import { voidExpense } from "./actions";

const paymentLabels: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  other: "Otro",
};
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export default async function ExpensesPage({
  searchParams,
}: PageProps<"/gastos">) {
  const context = await getOrganizationContext();
  const params = await searchParams;
  const notice = params.voided === "1" ? "Gasto anulado correctamente." : null;
  const alert =
    typeof params.error === "string"
      ? params.error === "permissions"
        ? "No tienes permiso para anular gastos."
        : params.error === "invalid"
          ? "El gasto seleccionado no es válido."
          : "No se pudo anular el gasto. Puede que ya estuviera anulado."
      : null;
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Guatemala",
  });
  const monthStart = `${today.slice(0, 8)}01`;
  const from =
    typeof params.from === "string" && datePattern.test(params.from)
      ? params.from
      : monthStart;
  const to =
    typeof params.to === "string" && datePattern.test(params.to)
      ? params.to
      : today;
  const canEdit = canManageExpenses(context.role);
  const canRead = canEdit || canViewReports(context.role);
  const currency =
    context.organization.currency_code === "GTQ"
      ? "Q"
      : context.organization.currency_code;
  if (!canRead)
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f5f1]">
        <div className="rounded-2xl bg-white p-10 text-center font-semibold text-red-700">
          Tu rol no permite consultar gastos.
          <br />
          <Link href="/" className="mt-4 inline-block text-[#285645] underline">
            Volver al panel
          </Link>
        </div>
      </main>
    );

  const { data: expenses, error } = await context.supabase
    .from("expenses")
    .select(
      "id, status, description, reference, amount, tax_amount, total, payment_method, incurred_at, category:expense_categories(name)",
    )
    .eq("organization_id", context.organization.id)
    .eq("location_id", context.location.id)
    .gte("incurred_at", `${from}T00:00:00-06:00`)
    .lte("incurred_at", `${to}T23:59:59.999-06:00`)
    .order("incurred_at", { ascending: false })
    .limit(500);
  const rows = error ? [] : (expenses ?? []);
  const posted = rows.filter((expense) => expense.status === "posted");
  const total = posted.reduce((sum, expense) => sum + Number(expense.total), 0);
  const taxes = posted.reduce(
    (sum, expense) => sum + Number(expense.tax_amount),
    0,
  );
  const byCategory = new Map<string, number>();
  posted.forEach((expense) => {
    const value = expense.category as
      | { name?: string }
      | Array<{ name?: string }>
      | null;
    const category =
      (Array.isArray(value) ? value[0]?.name : value?.name) || "Sin categoría";
    byCategory.set(
      category,
      (byCategory.get(category) ?? 0) + Number(expense.total),
    );
  });

  return (
    <main className="min-h-screen bg-[#f4f5f1] text-[#17251f]">
      <header className="bg-[#163f32] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <div>
            <p className="text-lg font-bold">{context.organization.name}</p>
            <p className="text-xs text-white/60">
              Gastos · {context.location.name}
            </p>
          </div>
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20"
          >
            <ArrowLeft size={16} /> Panel
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-9 lg:px-10">
        {notice && <p className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</p>}
        {alert && <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-800">{alert}</p>}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">
              Finanzas
            </p>
            <h1 className="mt-2 text-4xl font-bold tracking-[-0.04em]">
              Gastos
            </h1>
          </div>
          <form className="flex items-end gap-2 rounded-xl bg-white p-3">
            <DateField label="Desde" name="from" value={from} />
            <DateField label="Hasta" name="to" value={to} />
            <button className="h-10 rounded-lg bg-[#163f32] px-4 text-sm font-bold text-white">
              Aplicar
            </button>
          </form>
        </div>
        {canEdit && <ExpenseForm today={today} />}
        <section className="grid gap-4 sm:grid-cols-3">
          <Metric
            label="Total del período"
            value={`${currency} ${total.toFixed(2)}`}
            icon={CircleDollarSign}
          />
          <Metric
            label="Impuestos"
            value={`${currency} ${taxes.toFixed(2)}`}
            icon={WalletCards}
          />
          <Metric
            label="Registros activos"
            value={String(posted.length)}
            icon={CalendarDays}
          />
        </section>
        <div className="grid gap-5 lg:grid-cols-[1fr_2fr]">
          <section className="rounded-2xl border border-black/8 bg-white p-5">
            <h2 className="font-bold">Por categoría</h2>
            <div className="mt-4 space-y-3">
              {![...byCategory].length && (
                <p className="text-sm text-[#738078]">
                  Sin gastos en este período.
                </p>
              )}
              {[...byCategory.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([category, amount]) => (
                  <div
                    key={category}
                    className="flex justify-between border-b border-black/7 pb-3 text-sm last:border-0"
                  >
                    <span>{category}</span>
                    <strong>
                      {currency} {amount.toFixed(2)}
                    </strong>
                  </div>
                ))}
            </div>
          </section>
          <section className="overflow-hidden rounded-2xl border border-black/8 bg-white">
            <div className="border-b border-black/8 p-4">
              <h2 className="font-bold">Movimientos</h2>
            </div>
            <div className="divide-y divide-black/8">
              {!rows.length && (
                <p className="p-10 text-center text-sm text-[#738078]">
                  No hay gastos registrados.
                </p>
              )}
              {rows.map((expense) => {
                const value = expense.category as
                  | { name?: string }
                  | Array<{ name?: string }>
                  | null;
                const category =
                  (Array.isArray(value) ? value[0]?.name : value?.name) ||
                  "Sin categoría";
                return (
                  <article
                    key={expense.id}
                    className={`grid gap-3 p-4 text-sm md:grid-cols-[1fr_1fr_auto] ${expense.status === "voided" ? "opacity-45" : ""}`}
                  >
                    <div>
                      <p className="font-bold">{expense.description}</p>
                      <p className="text-xs text-[#75837b]">
                        {category}
                        {expense.reference ? ` · ${expense.reference}` : ""}
                      </p>
                    </div>
                    <div>
                      <p>
                        {new Intl.DateTimeFormat("es-GT", {
                          dateStyle: "medium",
                          timeZone: "America/Guatemala",
                        }).format(new Date(expense.incurred_at))}
                      </p>
                      <p className="text-xs text-[#75837b]">
                        {paymentLabels[expense.payment_method] ||
                          expense.payment_method}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold ${expense.status === "voided" ? "line-through" : ""}`}
                      >
                        {currency} {Number(expense.total).toFixed(2)}
                      </p>
                      {expense.status === "voided" ? (
                        <span className="text-xs font-semibold text-red-700">
                          Anulado
                        </span>
                      ) : (
                        canEdit && (
                          <form action={voidExpense}>
                            <input
                              type="hidden"
                              name="expenseId"
                              value={expense.id}
                            />
                            <VoidExpenseButton
                              description={expense.description}
                            />
                          </form>
                        )
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function DateField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label>
      <span className="mb-1 block text-xs font-semibold">{label}</span>
      <input
        className="h-10 rounded-lg border border-black/10 px-2 text-sm"
        type="date"
        name={name}
        defaultValue={value}
      />
    </label>
  );
}
function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof CircleDollarSign;
}) {
  return (
    <article className="rounded-2xl border border-black/8 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#617069]">{label}</span>
        <Icon size={18} className="text-[#39705b]" />
      </div>
      <p className="mt-5 text-2xl font-bold">{value}</p>
    </article>
  );
}
