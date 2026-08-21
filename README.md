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

## Seguridad

No agregues `.env.local`, contraseñas ni claves de servicio al repositorio. Las políticas RLS separan los datos de cada organización.
