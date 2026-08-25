insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id)do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.product_images(
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id)on delete cascade,
 product_id uuid not null,
 variant_id uuid,
 storage_path text not null,
 alt_text text,
 position integer not null default 0,
 created_by uuid references auth.users(id)on delete set null,
 created_at timestamptz not null default now(),
 unique(organization_id,storage_path),
 foreign key(organization_id,product_id)references public.products(organization_id,id)on delete cascade,
 foreign key(organization_id,variant_id)references public.product_variants(organization_id,id)on delete cascade
);
create index product_images_product_idx on public.product_images(product_id,position,created_at);
create index product_images_variant_idx on public.product_images(variant_id,position)where variant_id is not null;
alter table public.product_images enable row level security;
create policy "members read product images" on public.product_images for select to authenticated using(public.has_organization_role(organization_id,array['owner','admin','manager','cashier','inventory','viewer']::public.membership_role[]));
create policy "inventory roles insert product images" on public.product_images for insert to authenticated with check(public.has_organization_role(organization_id,array['owner','admin','manager','inventory']::public.membership_role[]));
create policy "inventory roles update product images" on public.product_images for update to authenticated using(public.has_organization_role(organization_id,array['owner','admin','manager','inventory']::public.membership_role[]))with check(public.has_organization_role(organization_id,array['owner','admin','manager','inventory']::public.membership_role[]));
create policy "inventory roles delete product images" on public.product_images for delete to authenticated using(public.has_organization_role(organization_id,array['owner','admin','manager','inventory']::public.membership_role[]));

create policy "public reads product image files" on storage.objects for select to public using(bucket_id='product-images');
create policy "inventory roles upload product image files" on storage.objects for insert to authenticated with check(bucket_id='product-images' and public.has_organization_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager','inventory']::public.membership_role[]));
create policy "inventory roles update product image files" on storage.objects for update to authenticated using(bucket_id='product-images' and public.has_organization_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager','inventory']::public.membership_role[]))with check(bucket_id='product-images' and public.has_organization_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager','inventory']::public.membership_role[]));
create policy "inventory roles delete product image files" on storage.objects for delete to authenticated using(bucket_id='product-images' and public.has_organization_role(((storage.foldername(name))[1])::uuid,array['owner','admin','manager','inventory']::public.membership_role[]));
