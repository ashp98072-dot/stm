"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageInventory, getOrganizationContext } from "@/lib/auth/organization";

const optionalCode=z.string().trim().max(80).transform(value=>value||null);
const variantSchema=z.object({productId:z.uuid(),variantId:z.string().transform(value=>value||null).pipe(z.uuid().nullable()),name:z.string().trim().min(1).max(160),sku:optionalCode,barcode:optionalCode,cost:z.string().transform(value=>value===""?null:Number(value)).pipe(z.number().min(0).nullable()),price:z.string().transform(value=>value===""?null:Number(value)).pipe(z.number().min(0).nullable()),attributeIds:z.array(z.uuid()).max(20),valueIds:z.array(z.uuid()).max(20)}).refine(value=>value.attributeIds.length===value.valueIds.length);

export async function saveVariant(formData:FormData){
  const attributeIds=formData.getAll("attributeId").map(String),valueIds=attributeIds.map(id=>String(formData.get(`value_${id}`)??""));
  const parsed=variantSchema.safeParse({productId:formData.get("productId"),variantId:formData.get("variantId")??"",name:formData.get("name"),sku:formData.get("sku")??"",barcode:formData.get("barcode")??"",cost:formData.get("cost")??"",price:formData.get("price")??"",attributeIds,valueIds});
  const productId=String(formData.get("productId")??"");
  if(!parsed.success)redirect(`/inventario/${productId}/variantes?error=invalid`);
  const context=await getOrganizationContext();
  if(!canManageInventory(context.role))redirect(`/inventario/${parsed.data.productId}/variantes?error=permissions`);
  const{error}=await context.supabase.rpc("save_product_variant",{p_variant_id:parsed.data.variantId,p_organization_id:context.organization.id,p_product_id:parsed.data.productId,p_name:parsed.data.name,p_sku:parsed.data.sku,p_barcode:parsed.data.barcode,p_cost:parsed.data.cost,p_price:parsed.data.price,p_attribute_ids:parsed.data.attributeIds,p_value_ids:parsed.data.valueIds});
  if(error)redirect(`/inventario/${parsed.data.productId}/variantes?error=${error.code==="23505"?"duplicate":"save"}`);
  revalidatePath(`/inventario/${parsed.data.productId}/variantes`);revalidatePath("/inventario");
  redirect(`/inventario/${parsed.data.productId}/variantes?saved=1`);
}

export async function deactivateVariant(formData:FormData){
  const parsed=z.object({productId:z.uuid(),variantId:z.uuid()}).safeParse({productId:formData.get("productId"),variantId:formData.get("variantId")});
  if(!parsed.success)redirect("/inventario");
  const context=await getOrganizationContext();
  if(!canManageInventory(context.role))redirect(`/inventario/${parsed.data.productId}/variantes?error=permissions`);
  const{error}=await context.supabase.rpc("deactivate_product_variant",{p_variant_id:parsed.data.variantId,p_organization_id:context.organization.id});
  if(error)redirect(`/inventario/${parsed.data.productId}/variantes?error=deactivate`);
  revalidatePath(`/inventario/${parsed.data.productId}/variantes`);
  redirect(`/inventario/${parsed.data.productId}/variantes?deactivated=1`);
}
