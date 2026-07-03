import type { Source } from "@/lib/db/schema";
import { amazonProvider } from "./amazon";
import { aliexpressProvider } from "./aliexpress";
import type { ProductProvider } from "./types";

export { ProviderError } from "./types";
export type { NormalizedProduct, ProductProvider } from "./types";

const providers: Record<Source, ProductProvider> = {
  amazon: amazonProvider,
  aliexpress: aliexpressProvider,
};

export function getProvider(source: Source): ProductProvider {
  return providers[source];
}
