# Boho Chic — Tienda de afiliados (Amazon + AliExpress)

Buscador y tienda de ropa estilo boho chic. Los productos se añaden desde un
panel de administración que busca en las APIs de Amazon (PA-API 5.0) y
AliExpress (Affiliate API), se guardan en Postgres (Neon) y se muestran en la
tienda pública con búsqueda, filtros y paginación. Un cron de Vercel refresca
precios y disponibilidad a diario.

## Stack

- **Next.js (App Router) + TypeScript**, desplegado en Vercel
- **Neon Postgres** con Drizzle ORM (`drizzle-kit` para migraciones)
- **Upstash for Redis** (sucesor de Vercel KV, opcional) para caché de listados
- Clientes propios de **Amazon PA-API 5.0** (firma SigV4) y **AliExpress Affiliate API**

## Estructura

| Ruta | Descripción |
| --- | --- |
| `/` | Tienda pública: búsqueda, filtros (tienda, categoría, precio), orden y paginación |
| `/go/[id]` | Redirección al enlace de afiliado + contador de clics |
| `/admin` | Dashboard (protegido por contraseña) |
| `/admin/search` | Buscar en Amazon/AliExpress y guardar productos |
| `/admin/products` | Editar/borrar/refrescar productos y alta manual |
| `/asistente` | Asistente de moda IA (NVIDIA `z-ai/glm-5.2` con tool calling) |
| `/api/cron/refresh-prices` | Cron diario de precios (Bearer `CRON_SECRET`) |

La lógica compartida vive en `lib/`: `db/` (esquema y cliente), `providers/`
(clientes de las APIs), `products.ts` (consultas), `cache.ts`, `auth.ts`,
`refresh.ts`. La protección de `/admin/*` y `/api/admin/*` está en `proxy.ts`.

## Puesta en marcha local

1. Crea una base de datos en [neon.tech](https://neon.tech) y copia la cadena
   de conexión (pooled).
2. Copia `.env.example` a `.env.local` y rellena las variables (ver
   comentarios en el propio archivo).
3. Instala y aplica el esquema:

   ```bash
   npm install
   npm run db:migrate   # o db:push para sincronizar sin migraciones
   ```

4. Arranca: `npm run dev` → tienda en `http://localhost:3000`, admin en
   `http://localhost:3000/admin`.

## Despliegue en Vercel

1. Sube el repositorio a GitHub e impórtalo en Vercel (o `vercel deploy`).
2. En **Settings → Environment Variables** añade todas las variables de
   `.env.example`. Para la caché, instala **Upstash for Redis** desde el
   Marketplace de Vercel (inyecta `KV_REST_API_URL` y `KV_REST_API_TOKEN`);
   es opcional.
3. El cron de `vercel.json` (`0 6 * * *`) queda registrado automáticamente al
   desplegar. Vercel llama al endpoint con `Authorization: Bearer CRON_SECRET`.
4. Aplica el esquema a la base de datos de producción desde tu máquina:
   `DATABASE_URL=<cadena de Neon> npm run db:migrate`.

## Notas sobre las APIs

- **Amazon PA-API**: el host/región/marketplace deben corresponder a tu cuenta
  de Associates (por defecto EE. UU.). El límite base es ~1 petición/segundo;
  si ves errores 429, espera y reintenta. `DetailPageURL` ya incluye tu
  partner tag.
- **AliExpress**: la búsqueda usa `aliexpress.affiliate.product.query` con tu
  `tracking_id`, que devuelve `promotion_link` por producto.
- Si una API no está disponible, el **alta manual** en `/admin/products`
  permite añadir productos pegando la URL de afiliado y sus datos.

## Asistente de moda

El chat de `/asistente` usa la API de NVIDIA (modelo `z-ai/glm-5.2`,
configurable con `NVIDIA_MODEL`) con dos herramientas: busca primero en el
catálogo guardado y, si no hay suficientes opciones, busca en vivo en
AliExpress y **autoguarda** los resultados en el catálogo (tag `asistente`),
de modo que las recomendaciones siempre llevan enlace de afiliado con clic
contado y la tienda crece con cada conversación. Si la API de NVIDIA está
saturada responde 503 con mensaje claro (timeout de 55 s por llamada).

## Cron de precios

Cada ejecución toma los ~40 productos con el chequeo más antiguo, consulta sus
APIs por lotes y actualiza precio, precio original, enlace y disponibilidad.
Los productos que el proveedor ya no devuelve se marcan **sin stock** (dejan de
mostrarse en la tienda, no se borran). También puede lanzarse manualmente desde
el dashboard.
