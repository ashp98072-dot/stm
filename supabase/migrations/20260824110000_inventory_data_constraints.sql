alter table public.inventory_levels
  drop constraint if exists inventory_levels_quantity_nonnegative;
alter table public.inventory_levels
  add constraint inventory_levels_quantity_nonnegative
  check (quantity >= 0) not valid;

alter table public.inventory_levels
  drop constraint if exists inventory_levels_reorder_point_nonnegative;
alter table public.inventory_levels
  add constraint inventory_levels_reorder_point_nonnegative
  check (reorder_point >= 0) not valid;

alter table public.products
  drop constraint if exists products_tax_rate_maximum;
alter table public.products
  add constraint products_tax_rate_maximum
  check (tax_rate <= 1) not valid;
