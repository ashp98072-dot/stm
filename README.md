# STM Next

Reescritura progresiva del sistema STM para Vercel y Supabase.

## Tecnología

- Next.js con App Router y TypeScript
- Supabase PostgreSQL, Auth y Row Level Security
- Tailwind CSS

## Desarrollo local

1. Copia `.env.example` como `.env.local`.
2. Crea un proyecto en Supabase y agrega la URL y la clave publicable.
3. Ejecuta la migración de `supabase/migrations` con Supabase CLI o el editor SQL.
4. Instala dependencias con `npm install`.
5. Inicia el proyecto con `npm run dev`.

La migración inicial incluye organizaciones, sucursales, perfiles, roles, categorías, clientes, productos, inventario, ventas, pagos y movimientos. Los campos `legacy_id` permiten asociar registros importados desde PHP/MySQL.

## Usuarios internos

El formulario acepta correos reales y nombres de usuario. Para crear el usuario `Mgarcia` desde Supabase Auth, registra el correo interno `mgarcia@stm.internal`; el login transforma automáticamente `Mgarcia` a ese identificador. Los nombres se normalizan a minúsculas para evitar duplicados por capitalización.

## Migraciones remotas

Aplica en orden todos los archivos de `supabase/migrations`. La migración `20260822000000_complete_sale.sql` instala la transacción segura que registra la venta, cobra, descuenta inventario y genera el recibo en una sola operación.

La migración `20260822010000_role_based_rls.sql` sustituye el acceso general por políticas RLS específicas para propietarios, administradores, gerentes, cajeros, inventario y lectores.

La migración `20260822020000_suppliers_and_purchases.sql` crea proveedores, compras y la recepción transaccional que actualiza costos, existencias y movimientos.

## Seguridad

No agregues `.env.local`, contraseñas ni claves de servicio al repositorio. Las políticas RLS separan los datos de cada organización.
