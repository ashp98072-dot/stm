"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import { inviteMember, type TeamState } from "./actions";

const initialState: TeamState = { message: "" };

export function InvitationForm({ canInviteAdmin }: { canInviteAdmin: boolean }) {
  const [state, action, pending] = useActionState(inviteMember, initialState);
  return (
    <form action={action} className="mt-5 space-y-4">
      <label className="block"><span className="mb-1.5 block text-sm font-semibold">Correo o usuario interno</span><input name="email" type="text" required placeholder="mgarcia@stm.internal" className="h-11 w-full rounded-xl border border-black/10 px-3 outline-none focus:border-[#3e735e]" /></label>
      <label className="block"><span className="mb-1.5 block text-sm font-semibold">Rol</span><select name="role" className="h-11 w-full rounded-xl border border-black/10 bg-white px-3"><option value="cashier">Cajero</option><option value="inventory">Inventario</option><option value="manager">Gerente</option><option value="viewer">Solo lectura</option>{canInviteAdmin && <option value="admin">Administrador</option>}</select></label>
      {state.message && <p className={`rounded-xl px-3 py-2 text-sm ${state.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>}
      <button disabled={pending} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#163f32] font-bold text-white disabled:opacity-60"><Send size={16} /> {pending ? "Preparando…" : "Crear invitación"}</button>
    </form>
  );
}
