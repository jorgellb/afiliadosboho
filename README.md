# Boho Chic — Tienda de afiliados de AliExpress

Buscador y tienda de ropa estilo boho chic. Los productos se añaden desde un
panel de administración que busca en la AliExpress Affiliate API, se guardan en Postgres (Neon) y se muestran en la
tienda pública con búsqueda, filtros y paginación. Un cron de Vercel refresca
precios y disponibilidad a diario.

## Stack

- **Next.js (App Router) + TypeScript**, desplegado en Vercel
- **Neon Postgres** con Drizzle ORM (`drizzle-kit` para migraciones)
- **Upstash for Redis** (sucesor de Vercel KV, opcional) para caché de listados
- Cliente propio de la **AliExpress Affiliate API** (firma del protocolo open platform)

## Estructura

| Ruta | Descripción |
| --- | --- |
| `/` | Tienda pública: búsqueda, filtros (categoría, precio), orden y paginación |
| `/go/[id]` | Redirección al enlace de afiliado + contador de clics |
| `/admin` | Dashboard (protegido por contraseña) |
| `/admin/search` | Buscar en AliExpress y guardar productos |
| `/admin/products` | Tabla con filtros propios y alta manual |
| `/admin/products/[id]` | Edición completa: producto, precios, estado y ficha SEO |
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

## Notas sobre la API

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

## Encuentra este Look (búsqueda por imagen, coste cero)

Sube una foto/captura de un outfit y encuentra las prendas más parecidas del
catálogo por búsqueda semántica. Todo en tier gratuito.

**Flujo**: la imagen se comprime en el navegador (máx 1280px, JPEG 0.8) → se
envía a `/api/find-look` como base64 (**no se almacena en ningún sitio**) → el
modelo de visión de NVIDIA descompone el outfit en prendas → cada prenda se
convierte en embedding (`nvidia/nv-embedqa-e5-v5`, 1024 dim) → **pgvector**
(HNSW, coseno) busca los productos más cercanos del mismo tipo → re-ranking por
color/detalle, umbral 0.55, relajación a tipos hermanos → resultados con foto
(URL original de AliExpress), precio, "% parecido" y enlace de afiliado.

**Indexación del catálogo** (Módulo A): cada producto se cataloga con visión
(descripción canónica en inglés + atributos) y se embebe. Por límite del free
tier de NIM (~40 req/min) y de los crons de Hobby, se hace en **lotes pequeños
reanudables** (`/api/catalog/embed-batch`, protegido con `INTERNAL_API_KEY`):
- Arranque masivo desde tu ordenador (recomendado): `node scripts/index-direct.mjs`
  indexa directo contra la BD y NIM (sin el timeout de las funciones serverless),
  con ritmo para respetar el rate limit. Alternativa vía endpoint:
  `npx tsx scripts/embed-all.ts` (lotes con pausas de 60s). Ambos reanudables.
- El cron diario indexa un lote de productos nuevos y limpia búsquedas >48h.

### Límites de cada tier gratuito usado
- **Neon free**: ~0.5 GB. Solo texto/vectores/URLs (nunca imágenes). Un vector
  de 1024 dim ≈ 4 KB → ~50.000 productos ≈ 200 MB. La BD se autosuspende: la
  primera búsqueda del día puede tardar 1-3s extra (cold start), no es un error.
- **NVIDIA NIM free**: ~40 req/min. Cola global de concurrencia 2; ante 429 se
  espera y reintenta. Tope diario de búsquedas configurable (`MAX_DAILY_SEARCHES`).
- **Vercel Hobby**: funciones ≤60s (lotes de 10 productos para no superarlo);
  crons diarios (uno solo hace indexación + limpieza).

### Re-indexado
Cambiar `EMBEDDING_MODEL` en `lib/nvidia.ts` obliga a re-indexar: el batch
detecta que las filas tienen otro `embedding_model` y las regenera solo.

### Si el proyecto crece
Primer cuello de botella: la **indexación** (visión + embedding por producto a
40 req/min ⇒ ~1.200 productos/hora de tu máquina con el script). El primer euro
mejor gastado sería un tier de NIM con más rate limit (o un modelo de embeddings
autoalojado), no almacenamiento: la BD aguanta decenas de miles de productos.

## Probador Boho Virtual

Prueba de accesorios en tiempo real, sin coste y sin registro. Flujo:

1. En la ficha de una pieza de **joyería o accesorios** aparece el botón
   "Probártelo con la cámara".
2. `POST /api/products/prepare` clasifica el producto con la IA multimodal de
   NVIDIA (cadena `lib/nvidia.ts`: llama-4-maverick → minimax-m3 → nemotron) y
   **cachea** el resultado en `product_tryon_assets` (categoría, `anchor_point`,
   `width_ratio`…). No se reprocesa dos veces; si los modelos con visión fallan,
   degrada a clasificación por título (`vision_used=false`).
3. `<ARTryOn>` usa MediaPipe FaceLandmarker + webcam y superpone el accesorio
   (recortado con WASM en el navegador) sobre orejas/cuello/cara/cabeza según su
   ancla. **Todo ocurre en el dispositivo**: ni la cámara ni la foto salen de él.
   Si se deniega la cámara, se puede probar sobre una foto subida.
4. Botón "Capturar look" exporta la imagen. La imagen del producto se sirve por
   `/api/tryon/image` (proxy same-origin) para poder dibujarla en el canvas.
5. La **estilista IA** (`/api/tryon/stylist`) sugiere 3 complementos reales del
   catálogo con enlace de afiliado.

Fases preparadas pero no activas (necesitan claves): try-on generativo de ropa
(Fashn.ai / Replicate + Vercel Blob) y looks compartidos. Sus tablas
(`tryon_jobs`, `stylist_suggestions`, `shared_looks`) ya existen.

## Cron de precios

Cada ejecución toma los ~40 productos con el chequeo más antiguo, consulta sus
APIs por lotes y actualiza precio, precio original, enlace y disponibilidad.
Los productos que el proveedor ya no devuelve se marcan **sin stock** (dejan de
mostrarse en la tienda, no se borran). También puede lanzarse manualmente desde
el dashboard.
