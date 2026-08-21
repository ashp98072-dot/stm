"use client";

import { useActionState } from "react";
import { LockKeyhole, UserRound } from "lucide-react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { message: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);
  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Usuario o correo electrónico</span>
        <span className="flex items-center gap-3 rounded-xl border border-black/10 bg-white px-4 focus-within:border-[#3e735e] focus-within:ring-4 focus-within:ring-[#3e735e]/10">
          <UserRound size={18} className="text-[#76857d]" />
          <input name="identifier" type="text" autoComplete="username" required className="h-12 w-full bg-transparent outline-none" placeholder="Mgarcia" />
        </span>
      </label>
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Contraseña</span>
        <span className="flex items-center gap-3 rounded-xl border border-black/10 bg-white px-4 focus-within:border-[#3e735e] focus-within:ring-4 focus-within:ring-[#3e735e]/10">
          <LockKeyhole size={18} className="text-[#76857d]" />
          <input name="password" type="password" autoComplete="current-password" minLength={6} required className="h-12 w-full bg-transparent outline-none" placeholder="••••••••" />
        </span>
      </label>
      {state.message && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.message}</p>}
      <button disabled={pending} className="h-12 w-full rounded-xl bg-[#163f32] font-bold text-white transition hover:bg-[#235743] disabled:cursor-wait disabled:opacity-60">
        {pending ? "Ingresando…" : "Ingresar"}
      </button>
    </form>
  );
}
