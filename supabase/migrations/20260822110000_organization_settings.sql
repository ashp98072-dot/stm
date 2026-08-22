alter table public.organizations
  add column tax_id text,
  add column address text,
  add column phone text,
  add column email text,
  add column receipt_footer text not null default 'Gracias por su compra.';
