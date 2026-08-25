"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageInventory, getOrganizationContext } from "@/lib/auth/organization";

const relationSchema=z.object({productId:z.uuid(),relatedProductId:z.uuid(),relationType:z.enum(["related","accessory","alternative"]),position:z.coerce.number().int().min(0).max(9999)});

export async function saveProductRelation(formData:FormData){
 const parsed=relationSchema.safeParse({productId:formData.get("productId"),relatedProductId:formData.get("relatedProductId"),relationType:formData.get("relationType"),position:formData.get("position")??0});
 if(!parsed.success||parsed.data.productId===parsed.data.relatedProductId)redirect(`/inventario/${parsed.success?parsed.data.productId:""}/relacionados?error=invalid`);
 const context=await getOrganizationContext();if(!canManageInventory(context.role))redirect(`/inventario/${parsed.data.productId}/relacionados?error=permissions`);
 const{data:products}=await context.supabase.from("products").select("id").eq("organization_id",context.organization.id).eq("active",true).in("id",[parsed.data.productId,parsed.data.relatedProductId]);
 if(products?.length!==2)redirect(`/inventario/${parsed.data.productId}/relacionados?error=invalid`);
 const{error}=await context.supabase.from("product_relations").upsert({organization_id:context.organization.id,product_id:parsed.data.productId,related_product_id:parsed.data.relatedProductId,relation_type:parsed.data.relationType,position:parsed.data.position,created_by:context.user.id},{onConflict:"product_id,related_product_id"});
 if(error)redirect(`/inventario/${parsed.data.productId}/relacionados?error=save`);
 revalidatePath(`/inventario/${parsed.data.productId}/relacionados`);redirect(`/inventario/${parsed.data.productId}/relacionados?saved=1`);
}

export async function deleteProductRelation(formData:FormData){
 const productId=z.uuid().safeParse(formData.get("productId")),relatedProductId=z.uuid().safeParse(formData.get("relatedProductId"));if(!productId.success||!relatedProductId.success)redirect("/inventario");
 const context=await getOrganizationContext();if(!canManageInventory(context.role))redirect(`/inventario/${productId.data}/relacionados?error=permissions`);
 const{error}=await context.supabase.from("product_relations").delete().eq("organization_id",context.organization.id).eq("product_id",productId.data).eq("related_product_id",relatedProductId.data);
 if(error)redirect(`/inventario/${productId.data}/relacionados?error=delete`);
 revalidatePath(`/inventario/${productId.data}/relacionados`);redirect(`/inventario/${productId.data}/relacionados?deleted=1`);
}
