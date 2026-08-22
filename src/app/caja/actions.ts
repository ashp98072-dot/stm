"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { canCreateSales, getOrganizationContext } from "@/lib/auth/organization";

const money = z.coerce.number().min(0).max(999999999);

export async function openRegister(formData: FormData) {
  const context = await getOrganizationContext();
  if (!canCreateSales(context.role)) redirect("/");
  const parsed = z.object({ amount: money, notes: z.string().trim().max(300) }).safeParse({ amount: formData.get("amount"), notes: formData.get("notes") });
  if (!parsed.success) redirect("/caja?error=invalid");
  const { error } = await context.supabase.rpc("open_cash_register", { p_organization_id: context.organization.id, p_location_id: context.location.id, p_opening_amount: parsed.data.amount, p_notes: parsed.data.notes });
  if (error) redirect("/caja?error=open");
  redirect("/caja?opened=1");
}

export async function addMovement(formData: FormData) {
  const context = await getOrganizationContext();
  const parsed = z.object({ sessionId: z.string().uuid(), type: z.enum(["deposit", "withdrawal"]), amount: money.positive(), reason: z.string().trim().min(3).max(300) }).safeParse({ sessionId: formData.get("sessionId"), type: formData.get("type"), amount: formData.get("amount"), reason: formData.get("reason") });
  if (!parsed.success) redirect("/caja?error=movement");
  const { error } = await context.supabase.rpc("add_cash_register_movement", { p_session_id: parsed.data.sessionId, p_type: parsed.data.type, p_amount: parsed.data.amount, p_reason: parsed.data.reason });
  if (error) redirect("/caja?error=movement");
  redirect("/caja?movement=1");
}

export async function closeRegister(formData: FormData) {
  const context = await getOrganizationContext();
  const parsed = z.object({ sessionId: z.string().uuid(), amount: money, notes: z.string().trim().max(300) }).safeParse({ sessionId: formData.get("sessionId"), amount: formData.get("amount"), notes: formData.get("notes") });
  if (!parsed.success) redirect("/caja?error=close");
  const { error } = await context.supabase.rpc("close_cash_register", { p_session_id: parsed.data.sessionId, p_closing_amount: parsed.data.amount, p_notes: parsed.data.notes });
  if (error) redirect("/caja?error=close");
  redirect("/caja?closed=1");
}
