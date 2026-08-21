import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-[#f4f5f1] lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden overflow-hidden bg-[#163f32] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#d7f36b] text-xl font-black text-[#163f32]">S</div><span className="text-xl font-bold">STM</span></div>
        <div className="max-w-xl">
          <p className="mb-5 text-sm font-bold uppercase tracking-[0.22em] text-[#d7f36b]">Una nueva etapa</p>
          <h1 className="text-6xl font-bold leading-[1.02] tracking-[-0.05em]">Tu negocio,<br />más claro.</h1>
          <p className="mt-7 max-w-md text-lg leading-8 text-white/65">Ventas, inventario y clientes en una plataforma segura, rápida y disponible desde cualquier lugar.</p>
        </div>
        <p className="text-sm text-white/40">STM · Guatemala</p>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden"><div className="grid size-10 place-items-center rounded-xl bg-[#163f32] font-black text-[#d7f36b]">S</div><span className="text-xl font-bold">STM</span></div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#517064]">Acceso seguro</p>
          <h2 className="mt-3 text-4xl font-bold tracking-[-0.04em]">Bienvenido de nuevo</h2>
          <p className="mt-3 text-[#68766f]">Ingresa con la cuenta registrada en Supabase.</p>
          <LoginForm />
          <p className="mt-7 text-center text-xs leading-5 text-[#87928c]">El acceso y los datos están protegidos por Supabase Auth y políticas RLS.</p>
        </div>
      </section>
    </main>
  );
}
