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

La migración `20260822030000_expenses.sql` agrega categorías y gastos operativos con impuestos, métodos de pago, estados auditables y políticas por rol.

La migración `20260822040000_team_management.sql` incorpora invitaciones y administración segura de colaboradores. El correo de la invitación debe coincidir con el usuario creado en Supabase Auth; los usuarios internos usan el formato `usuario@stm.internal`.

La migración `20260822050000_location_management.sql` permite administrar sucursales y guardar una ubicación de trabajo por usuario. Las ventas, compras, gastos y ajustes de inventario usan automáticamente la sucursal seleccionada.

La migración `20260822060000_inventory_transfers.sql` registra transferencias atómicas entre sucursales, valida existencias y crea movimientos de salida y entrada para auditoría.

La migración `20260822070000_sale_voids.sql` permite anular ventas completadas, restaura las existencias en la sucursal original y conserva el motivo y el usuario responsable.

La migración `20260822080000_cash_register.sql` agrega sesiones de caja por cajero y sucursal, movimientos manuales, cálculo del efectivo esperado y diferencias de cierre.

La migración `20260822090000_sale_discounts.sql` agrega descuentos porcentuales o fijos, distribuidos entre las líneas para recalcular correctamente impuestos, utilidad y recibos.

La migración `20260822100000_customer_credit.sql` convierte las ventas con crédito tienda en cuentas por cobrar, registra abonos y reversiones, e integra las cobranzas en efectivo al cierre de caja.

La migración `20260822110000_organization_settings.sql` agrega datos fiscales y de contacto, moneda, zona horaria y texto configurable para los recibos.

La migración `20260822120000_quotes.sql` agrega cotizaciones con precios congelados, vigencia, impresión y conversión directa a venta.

## Seguridad

No agregues `.env.local`, contraseñas ni claves de servicio al repositorio. Las políticas RLS separan los datos de cada organización.
