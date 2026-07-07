import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const SOURCES = ["aliexpress"] as const;
export type Source = (typeof SOURCES)[number];

export const CATEGORIES = [
  "vestidos",
  "blusas",
  "faldas",
  "pantalones",
  "kimonos",
  "accesorios",
  "bolsos",
  "calzado",
  "joyeria",
  "otros",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source", { enum: SOURCES }).notNull().default("aliexpress"),
    sourceProductId: text("source_product_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    imageUrl: text("image_url").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("USD"),
    originalPrice: numeric("original_price", { precision: 10, scale: 2 }),
    affiliateUrl: text("affiliate_url").notNull(),
    productUrl: text("product_url"),
    category: text("category", { enum: CATEGORIES }).notNull().default("otros"),
    tags: text("tags").array().notNull().default([]),
    // Ficha SEO generada por el agente (null hasta que se genera).
    slug: text("slug"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    metaTitle: text("meta_title"),
    metaDescription: text("meta_description"),
    // Prueba social de AliExpress (nullable: solo se muestra si hay dato real).
    rating: numeric("rating", { precision: 4, scale: 1 }), // % de valoraciones positivas 0-100
    ordersCount: integer("orders_count"), // unidades vendidas recientes
    discountPct: integer("discount_pct"), // % de descuento
    available: boolean("available").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    clicks: integer("clicks").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("products_source_source_product_id_idx").on(
      table.source,
      table.sourceProductId
    ),
    index("products_category_idx").on(table.category),
    index("products_last_checked_at_idx").on(table.lastCheckedAt),
    uniqueIndex("products_slug_idx").on(table.slug),
  ]
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

/** Suscriptores captados por el quiz de estilo o la newsletter. */
export const subscribers = pgTable(
  "subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    source: text("source").notNull().default("quiz"),
    styleResult: text("style_result"), // perfil de estilo del quiz
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("subscribers_email_idx").on(table.email)]
);

export type Subscriber = typeof subscribers.$inferSelect;

/** Eventos de clic para atribución por fuente (ficha, look, quiz, home…). */
export const clickEvents = pgTable(
  "click_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull(),
    source: text("source").notNull().default("directo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("click_events_product_idx").on(table.productId)]
);

/** Artículos editoriales generados por IA (motor de contenido SEO). */
export const articles = pgTable(
  "articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    metaTitle: text("meta_title").notNull(),
    metaDescription: text("meta_description").notNull(),
    excerpt: text("excerpt").notNull(),
    body: text("body").notNull(), // markdown ligero
    category: text("category", { enum: CATEGORIES }).notNull().default("otros"),
    heroImageUrl: text("hero_image_url"),
    productIds: uuid("product_ids").array().notNull().default([]),
    published: boolean("published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("articles_slug_idx").on(table.slug)]
);

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;

// ============================================================
// Probador Boho Virtual
// ============================================================

/** Clasificación visual cacheada de cada producto para el probador. */
export const productTryonAssets = pgTable(
  "product_tryon_assets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    productId: text("product_id").notNull().unique(),
    category: text("category"), // 'garment' | 'accessory'
    subcategory: text("subcategory"),
    originalUrl: text("original_url"),
    cleanUrl: text("clean_url"),
    anchorPoint: text("anchor_point"), // left_ear|right_ear|neck|head|face|null
    widthRatio: real("width_ratio"),
    colors: text("colors").array(),
    styleTags: text("style_tags").array(),
    visionUsed: boolean("vision_used").notNull().default(true),
    status: text("status").notNull().default("pending"), // pending|processing|ready|failed
    errorMsg: text("error_msg"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [index("product_tryon_assets_status_idx").on(table.status)]
);

export type TryonAsset = typeof productTryonAssets.$inferSelect;

/** Trabajos de try-on generativo de ropa (fase C, aún no activa). */
export const tryonJobs = pgTable(
  "tryon_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: text("product_id").notNull(),
    sessionId: text("session_id").notNull(),
    userPhotoUrl: text("user_photo_url").notNull(),
    resultUrl: text("result_url"),
    provider: text("provider"),
    status: text("status").notNull().default("queued"), // queued|processing|done|failed
    errorMsg: text("error_msg"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '24 hours'`),
  },
  (table) => [
    index("tryon_jobs_status_created_idx").on(table.status, table.createdAt),
    index("tryon_jobs_session_idx").on(table.sessionId),
  ]
);

/** Sugerencias de la estilista IA asociadas a un job (fase C). */
export const stylistSuggestions = pgTable("stylist_suggestions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jobId: uuid("job_id").references(() => tryonJobs.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  reason: text("reason"),
  clicked: boolean("clicked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Looks compartidos públicamente (fase E). */
export const sharedLooks = pgTable("shared_looks", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id"),
  imageUrl: text("image_url").notNull(),
  productIds: text("product_ids").array().notNull(),
  slug: text("slug").notNull().unique(),
  views: integer("views").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
