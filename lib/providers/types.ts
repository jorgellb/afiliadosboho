import type { Source } from "@/lib/db/schema";

/** Producto normalizado, tal como lo devuelven ambos proveedores. */
export interface NormalizedProduct {
  source: Source;
  sourceProductId: string;
  title: string;
  description: string | null;
  imageUrl: string;
  price: string | null; // decimal como string, p. ej. "19.99"; null si no hay oferta activa
  currency: string;
  originalPrice: string | null;
  affiliateUrl: string;
  productUrl: string | null;
  available: boolean;
  // Prueba social (null si el proveedor no la aporta).
  rating: string | null; // % de valoraciones positivas 0-100
  ordersCount: number | null; // unidades vendidas recientes
  discountPct: number | null; // % de descuento
}

export interface ProductProvider {
  readonly source: Source;
  /** Busca productos por texto libre (para el panel admin). */
  search(query: string, page: number): Promise<NormalizedProduct[]>;
  /** Recupera productos por sus IDs de origen (para el cron de precios). */
  getByIds(ids: string[]): Promise<NormalizedProduct[]>;
}

/** Error de proveedor con mensaje apto para mostrar en el panel admin. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: Source,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}
