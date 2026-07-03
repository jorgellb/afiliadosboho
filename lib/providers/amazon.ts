import { createHash, createHmac } from "node:crypto";
import {
  NormalizedProduct,
  ProductProvider,
  ProviderError,
  requireEnv,
} from "./types";

/**
 * Cliente de Amazon Product Advertising API 5.0 con firma AWS SigV4
 * implementada con node:crypto (los SDKs npm de PA-API están abandonados).
 *
 * Docs: https://webservices.amazon.com/paapi5/documentation/
 */

const SERVICE = "ProductAdvertisingAPI";

const RESOURCES = [
  "Images.Primary.Large",
  "ItemInfo.Title",
  "ItemInfo.Features",
  "Offers.Listings.Price",
  "Offers.Listings.SavingBasis",
  "Offers.Listings.Availability.Type",
];

interface PaapiItem {
  ASIN: string;
  DetailPageURL?: string;
  Images?: { Primary?: { Large?: { URL?: string } } };
  ItemInfo?: {
    Title?: { DisplayValue?: string };
    Features?: { DisplayValues?: string[] };
  };
  Offers?: {
    Listings?: Array<{
      Price?: { Amount?: number; Currency?: string };
      SavingBasis?: { Amount?: number };
      Availability?: { Type?: string };
    }>;
  };
}

function config() {
  return {
    accessKey: requireEnv("AMAZON_PAAPI_ACCESS_KEY"),
    secretKey: requireEnv("AMAZON_PAAPI_SECRET_KEY"),
    partnerTag: requireEnv("AMAZON_PARTNER_TAG"),
    host: process.env.AMAZON_PAAPI_HOST || "webservices.amazon.com",
    region: process.env.AMAZON_PAAPI_REGION || "us-east-1",
    marketplace: process.env.AMAZON_MARKETPLACE || "www.amazon.com",
    searchIndex: process.env.AMAZON_SEARCH_INDEX || "All",
  };
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

/** Ejecuta una operación PA-API (SearchItems / GetItems) firmada con SigV4. */
async function paapiRequest(
  operation: "SearchItems" | "GetItems",
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const { accessKey, secretKey, host, region } = config();
  const path = `/paapi5/${operation.toLowerCase()}`;
  const target = `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${operation}`;
  const body = JSON.stringify(payload);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  // Firma SigV4 — cabeceras firmadas en orden alfabético.
  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${target}\n`;
  const signedHeaders = "content-encoding;host;x-amz-date;x-amz-target";
  const canonicalRequest = [
    "POST",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  const response = await fetch(`https://${host}${path}`, {
    method: "POST",
    headers: {
      "content-encoding": "amz-1.0",
      "content-type": "application/json; charset=utf-8",
      "x-amz-date": amzDate,
      "x-amz-target": target,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body,
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const errors = data.Errors as Array<{ Code?: string; Message?: string }> | undefined;
    const detail = errors?.[0]?.Message || `HTTP ${response.status}`;
    if (response.status === 429) {
      throw new ProviderError(
        "Amazon PA-API: límite de peticiones alcanzado, espera un momento y reintenta.",
        "amazon",
        429
      );
    }
    throw new ProviderError(`Amazon PA-API: ${detail}`, "amazon", response.status);
  }

  return data;
}

function normalizeItem(item: PaapiItem): NormalizedProduct | null {
  const title = item.ItemInfo?.Title?.DisplayValue;
  const imageUrl = item.Images?.Primary?.Large?.URL;
  if (!item.ASIN || !title || !imageUrl || !item.DetailPageURL) return null;

  const listing = item.Offers?.Listings?.[0];
  const price = listing?.Price?.Amount;
  const savingBasis = listing?.SavingBasis?.Amount;
  const available =
    listing?.Availability?.Type === undefined
      ? price !== undefined
      : listing.Availability.Type === "Now";

  return {
    source: "amazon",
    sourceProductId: item.ASIN,
    title,
    description: item.ItemInfo?.Features?.DisplayValues?.join(" · ") ?? null,
    imageUrl,
    price: price !== undefined ? price.toFixed(2) : null,
    currency: listing?.Price?.Currency || "USD",
    originalPrice:
      savingBasis !== undefined && price !== undefined && savingBasis > price
        ? savingBasis.toFixed(2)
        : null,
    // DetailPageURL ya incluye el partner tag de la cuenta.
    affiliateUrl: item.DetailPageURL,
    productUrl: `https://${config().marketplace}/dp/${item.ASIN}`,
    available: available && price !== undefined,
  };
}

export const amazonProvider: ProductProvider = {
  source: "amazon",

  async search(query: string, page: number): Promise<NormalizedProduct[]> {
    const { partnerTag, marketplace, searchIndex } = config();
    const data = await paapiRequest("SearchItems", {
      Keywords: query,
      SearchIndex: searchIndex,
      ItemCount: 10,
      ItemPage: Math.min(Math.max(page, 1), 10),
      PartnerTag: partnerTag,
      PartnerType: "Associates",
      Marketplace: marketplace,
      Resources: RESOURCES,
    });
    const items =
      (data.SearchResult as { Items?: PaapiItem[] } | undefined)?.Items ?? [];
    return items
      .map(normalizeItem)
      .filter((p): p is NormalizedProduct => p !== null);
  },

  async getByIds(ids: string[]): Promise<NormalizedProduct[]> {
    const { partnerTag, marketplace } = config();
    const results: NormalizedProduct[] = [];
    // GetItems admite un máximo de 10 ASINs por petición.
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      const data = await paapiRequest("GetItems", {
        ItemIds: batch,
        PartnerTag: partnerTag,
        PartnerType: "Associates",
        Marketplace: marketplace,
        Resources: RESOURCES,
      });
      const items =
        (data.ItemsResult as { Items?: PaapiItem[] } | undefined)?.Items ?? [];
      results.push(
        ...items.map(normalizeItem).filter((p): p is NormalizedProduct => p !== null)
      );
    }
    return results;
  },
};
