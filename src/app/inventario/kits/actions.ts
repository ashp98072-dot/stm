"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageInventory,getOrganizationContext } from "@/lib/auth/organization";

export async function saveKit(formData:FormData){
  const productId=z.uuid().safeParse(formData.get("productId")),componentIds=formData.getAll("componentId").map(String),components=componentIds.map(id=>({product_id:id,quantity:Number(formData.get(`quantity_${id}`))})),parsed=z.array(z.object({product_id:z.uuid(),quantity:z.number().positive().max(999999)})).min(1).max(200).safeParse(components);
  if(!productId.success||!parsed.success)redirect("/inventario/kits?error=invalid");
  const context=await getOrganizationContext();if(!canManageInventory(context.role))redirect("/inventario/kits?error=permissions");
  const{error}=await context.supabase.rpc("save_product_kit",{p_organization_id:context.organization.id,p_product_id:productId.data,p_components:parsed.data});
  if(error)redirect(`/inventario/kits?error=${error.code==="23505"?"duplicate":"save"}`);
  revalidatePath("/inventario/kits");revalidatePath("/inventario");revalidatePath("/ventas");redirect("/inventario/kits?saved=1");
}
export async function deactivateKit(formData:FormData){
  const parsed=z.object({kitId:z.uuid()}).safeParse({kitId:formData.get("kitId")});if(!parsed.success)redirect("/inventario/kits?error=invalid");const context=await getOrganizationContext();if(!canManageInventory(context.role))redirect("/inventario/kits?error=permissions");const{error}=await context.supabase.rpc("deactivate_product_kit",{p_kit_id:parsed.data.kitId,p_organization_id:context.organization.id});if(error)redirect("/inventario/kits?error=deactivate");revalidatePath("/inventario/kits");revalidatePath("/ventas");redirect("/inventario/kits?deactivated=1");
}
