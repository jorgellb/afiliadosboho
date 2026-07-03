import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const SOURCES = ["amazon", "aliexpress"] as const;
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
    source: text("source", { enum: SOURCES }).notNull(),
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
  ]
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
