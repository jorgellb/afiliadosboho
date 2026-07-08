import { createHmac } from "node:crypto";
import {
  NormalizedProduct,
  ProductProvider,
  ProviderError,
  requireEnv,
} from "./types";

/**
 * Cliente de AliExpress Affiliate API (Open Platform, endpoint /sync).
 *
 * Firma: se ordenan todos los parámetros por nombre, se concatenan como
 * clave+valor y se calcula HMAC-SHA256 con el app secret, en hex mayúsculas.
 * Docs: https://openservice.aliexpress.com/doc/doc.htm
 */

const ENDPOINT = "https://api-sg.aliexpress.com/sync";

interface AliProduct {
  product_id: number | string;
  product_title?: string;
  product_main_image_url?: string;
  target_sale_price?: string;
  target_sale_price_currency?: string;
  target_original_price?: string;
  promotion_link?: string;
  product_detail_url?: string;
  evaluate_rate?: string; // "96.5%"
  lastest_volume?: number;
  discount?: string; // "52%"
}

function config() {
  return {
    appKey: requireEnv("ALIEXPRESS_APP_KEY"),
    appSecret: requireEnv("ALIEXPRESS_APP_SECRET"),
    trackingId: requireEnv("ALIEXPRESS_TRACKING_ID"),
    currency: process.env.ALIEXPRESS_TARGET_CURRENCY || "EUR",
    language: process.env.ALIEXPRESS_TARGET_LANGUAGE || "ES",
    shipTo: process.env.ALIEXPRESS_SHIP_TO || "",
  };
}

function sign(params: Record<string, string>, appSecret: string): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  return createHmac("sha256", appSecret).update(base, "utf8").digest("hex").toUpperCase();
}

async function aliRequest(
  method: string,
  businessParams: Record<string, string>
): Promise<Record<string, unknown>> {
  const { appKey, appSecret } = config();
  const params: Record<string, string> = {
    method,
    app_key: appKey,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    ...businessParams,
  };
  params.sign = sign(params, appSecret);

  const url = `${ENDPOINT}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  const errorResponse = data.error_response as
    | { code?: string | number; msg?: string; sub_msg?: string }
    | undefined;
  if (errorResponse) {
    const detail = errorResponse.sub_msg || errorResponse.msg || "error desconocido";
    throw new ProviderError(`AliExpress API: ${detail}`, "aliexpress", response.status);
  }
  if (!response.ok) {
    throw new ProviderError(
      `AliExpress API: HTTP ${response.status}`,
      "aliexpress",
      response.status
    );
  }
  return data;
}

/** Extrae la lista de productos de la respuesta anidada típica del API. */
function extractProducts(
  data: Record<string, unknown>,
  responseKey: string
): AliProduct[] {
  const resp = data[responseKey] as
    | {
        resp_result?: {
          resp_code?: number;
          resp_msg?: string;
          result?: { products?: { product?: AliProduct[] } };
        };
      }
    | undefined;
  const respResult = resp?.resp_result;
  if (!respResult) return [];
  if (respResult.resp_code !== undefined && respResult.resp_code !== 200) {
    throw new ProviderError(
      `AliExpress API: ${respResult.resp_msg || `código ${respResult.resp_code}`}`,
      "aliexpress"
    );
  }
  return respResult.result?.products?.product ?? [];
}

/** Extrae un porcentaje ("52%", "96.5%") a número entero/decimal, o null. */
function parsePct(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace("%", "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeProduct(p: AliProduct): NormalizedProduct | null {
  const id = p.product_id !== undefined ? String(p.product_id) : null;
  if (!id || !p.product_title || !p.product_main_image_url) return null;
  const affiliateUrl = p.promotion_link || p.product_detail_url;
  if (!affiliateUrl) return null;

  const price = p.target_sale_price ? Number(p.target_sale_price) : NaN;
  const original = p.target_original_price ? Number(p.target_original_price) : NaN;
  const originalPrice =
    Number.isFinite(original) && Number.isFinite(price) && original > price
      ? original.toFixed(2)
      : null;

  // Descuento: primero el del API; si no, calculado sobre el precio original.
  let discountPct = parsePct(p.discount);
  if (discountPct === null && originalPrice) {
    discountPct = Math.round((1 - price / Number(originalPrice)) * 100) || null;
  }
  const rating = parsePct(p.evaluate_rate);
  const orders =
    typeof p.lastest_volume === "number" && p.lastest_volume > 0
      ? p.lastest_volume
      : null;

  return {
    source: "aliexpress",
    sourceProductId: id,
    title: p.product_title,
    description: null,
    imageUrl: p.product_main_image_url,
    price: Number.isFinite(price) ? price.toFixed(2) : null,
    currency: p.target_sale_price_currency || config().currency,
    originalPrice,
    affiliateUrl,
    productUrl: p.product_detail_url ?? null,
    available: Number.isFinite(price),
    rating: rating !== null ? rating.toFixed(1) : null,
    ordersCount: orders,
    discountPct: discountPct !== null ? Math.round(discountPct) : null,
  };
}

export const aliexpressProvider: ProductProvider = {
  source: "aliexpress",

  async search(query: string, page: number): Promise<NormalizedProduct[]> {
    const { trackingId, currency, language, shipTo } = config();
    // hotproduct.query prioriza productos que se venden y aporta descuento y,
    // cuando existe, valoración; mejor para una tienda de afiliados.
    const data = await aliRequest("aliexpress.affiliate.hotproduct.query", {
      keywords: query,
      page_no: String(Math.max(page, 1)),
      page_size: "20",
      tracking_id: trackingId,
      target_currency: currency,
      target_language: language,
      ...(shipTo ? { ship_to_country: shipTo } : {}),
    });
    return extractProducts(data, "aliexpress_affiliate_hotproduct_query_response")
      .map(normalizeProduct)
      .filter((p): p is NormalizedProduct => p !== null);
  },

  async getByIds(ids: string[]): Promise<NormalizedProduct[]> {
    const { trackingId, currency, language, shipTo } = config();
    const results: NormalizedProduct[] = [];
    // productdetail.get admite hasta 50 IDs separados por coma; usamos lotes de 20.
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const data = await aliRequest("aliexpress.affiliate.productdetail.get", {
        product_ids: batch.join(","),
        tracking_id: trackingId,
        target_currency: currency,
        target_language: language,
        ...(shipTo ? { country: shipTo } : {}),
      });
      results.push(
        ...extractProducts(data, "aliexpress_affiliate_productdetail_get_response")
          .map(normalizeProduct)
          .filter((p): p is NormalizedProduct => p !== null)
      );
    }
    return results;
  },
};
