"use client";

import { useActionState } from "react";
import { Building2 } from "lucide-react";
import { createOrganization, type OnboardingState } from "./actions";

const initialState: OnboardingState = { message: "" };

export function OrganizationForm() {
  const [state, action, pending] = useActionState(createOrganization, initialState);
  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">Nombre del negocio</span>
        <span className="flex items-center gap-3 rounded-xl border border-black/10 bg-white px-4 focus-within:border-[#3e735e] focus-within:ring-4 focus-within:ring-[#3e735e]/10">
          <Building2 size={18} className="text-[#76857d]" />
          <input name="name" type="text" required minLength={2} maxLength={100} autoFocus className="h-12 w-full bg-transparent outline-none" placeholder="Mi empresa" />
        </span>
      </label>
      {state.message && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{state.message}</p>}
      <button disabled={pending} className="h-12 w-full rounded-xl bg-[#163f32] font-bold text-white transition hover:bg-[#235743] disabled:cursor-wait disabled:opacity-60">
        {pending ? "Creando…" : "Crear empresa"}
      </button>
    </form>
  );
}
