"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canManageInventory, getOrganizationContext } from "@/lib/auth/organization";

const accepted=new Set(["image/jpeg","image/png","image/webp","image/gif"]);
export async function uploadProductImage(formData:FormData){
 const productId=z.uuid().safeParse(formData.get("productId")),variantId=z.string().transform(value=>value||null).pipe(z.uuid().nullable()).safeParse(formData.get("variantId")??""),altText=z.string().trim().max(200).safeParse(formData.get("altText")??""),file=formData.get("image");
 if(!productId.success||!variantId.success||!altText.success||!(file instanceof File)||file.size<=0||file.size>5242880||!accepted.has(file.type))redirect(`/inventario/${productId.success?productId.data:""}/imagenes?error=invalid`);
 const context=await getOrganizationContext();if(!canManageInventory(context.role))redirect(`/inventario/${productId.data}/imagenes?error=permissions`);
 const{data:product}=await context.supabase.from("products").select("id").eq("id",productId.data).eq("organization_id",context.organization.id).eq("active",true).maybeSingle();if(!product)redirect("/inventario?error=invalid-product");
 if(variantId.data){const{data:variant}=await context.supabase.from("product_variants").select("id").eq("id",variantId.data).eq("product_id",productId.data).eq("organization_id",context.organization.id).eq("active",true).maybeSingle();if(!variant)redirect(`/inventario/${productId.data}/imagenes?error=invalid`);}
 const extension=file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g,"")||file.type.split("/")[1]||"img",path=`${context.organization.id}/${productId.data}/${crypto.randomUUID()}.${extension}`;
 const{error:uploadError}=await context.supabase.storage.from("product-images").upload(path,file,{contentType:file.type,upsert:false});if(uploadError)redirect(`/inventario/${productId.data}/imagenes?error=upload`);
 const{data:last}=await context.supabase.from("product_images").select("position").eq("organization_id",context.organization.id).eq("product_id",productId.data).order("position",{ascending:false}).limit(1).maybeSingle();
 const{error}=await context.supabase.from("product_images").insert({organization_id:context.organization.id,product_id:productId.data,variant_id:variantId.data,storage_path:path,alt_text:altText.data||null,position:Number(last?.position??-1)+1,created_by:context.user.id});
 if(error){await context.supabase.storage.from("product-images").remove([path]);redirect(`/inventario/${productId.data}/imagenes?error=save`);}
 revalidatePath(`/inventario/${productId.data}/imagenes`);redirect(`/inventario/${productId.data}/imagenes?uploaded=1`);
}

export async function deleteProductImage(formData:FormData){
 const productId=z.uuid().safeParse(formData.get("productId")),imageId=z.uuid().safeParse(formData.get("imageId"));if(!productId.success||!imageId.success)redirect("/inventario");
 const context=await getOrganizationContext();if(!canManageInventory(context.role))redirect(`/inventario/${productId.data}/imagenes?error=permissions`);
 const{data:image}=await context.supabase.from("product_images").select("storage_path").eq("id",imageId.data).eq("product_id",productId.data).eq("organization_id",context.organization.id).maybeSingle();if(!image)redirect(`/inventario/${productId.data}/imagenes?error=missing`);
 const{error:storageError}=await context.supabase.storage.from("product-images").remove([image.storage_path]);if(storageError)redirect(`/inventario/${productId.data}/imagenes?error=delete`);
 const{error}=await context.supabase.from("product_images").delete().eq("id",imageId.data).eq("organization_id",context.organization.id);if(error)redirect(`/inventario/${productId.data}/imagenes?error=delete`);
 revalidatePath(`/inventario/${productId.data}/imagenes`);redirect(`/inventario/${productId.data}/imagenes?deleted=1`);
}

export async function moveProductImage(formData:FormData){
 const productId=z.uuid().safeParse(formData.get("productId")),imageId=z.uuid().safeParse(formData.get("imageId")),position=z.coerce.number().int().min(0).safeParse(formData.get("position"));if(!productId.success||!imageId.success||!position.success)redirect("/inventario");
 const context=await getOrganizationContext();if(!canManageInventory(context.role))redirect(`/inventario/${productId.data}/imagenes?error=permissions`);
 const{error}=await context.supabase.from("product_images").update({position:position.data}).eq("id",imageId.data).eq("product_id",productId.data).eq("organization_id",context.organization.id);if(error)redirect(`/inventario/${productId.data}/imagenes?error=order`);
 revalidatePath(`/inventario/${productId.data}/imagenes`);redirect(`/inventario/${productId.data}/imagenes?ordered=1`);
}
