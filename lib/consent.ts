/**
 * Consentimiento de cookies.
 *
 * Se guarda en una cookie propia (`bc_consent`) legible desde el cliente, con
 * una versión: si algún día cambian las categorías, se vuelve a preguntar.
 * Ninguna categoría opcional se activa sin una acción explícita.
 */

export const CONSENT_COOKIE = "bc_consent";
export const CONSENT_VERSION = 1;
/** 12 meses: la AEPD recomienda renovar el consentimiento como mucho a los 24. */
const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

/** El pie de página pide abrir el panel de preferencias. */
export const OPEN_SETTINGS_EVENT = "bc:cookie-settings";
/** Se emite al guardar una decisión: aquí engancharían futuros scripts. */
export const CONSENT_EVENT = "bc:consent";

export interface Consent {
  v: number;
  /** Fecha de la decisión, en milisegundos. */
  ts: number;
  analytics: boolean;
  personalization: boolean;
}

export type ConsentChoice = Pick<Consent, "analytics" | "personalization">;

export const REJECT_ALL: ConsentChoice = { analytics: false, personalization: false };
export const ACCEPT_ALL: ConsentChoice = { analytics: true, personalization: true };

/** Decisión guardada, o null si no hay ninguna válida para esta versión. */
export function readConsent(): Consent | null {
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Consent;
    if (parsed.v !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(choice: ConsentChoice): Consent {
  const value: Consent = { v: CONSENT_VERSION, ts: Date.now(), ...choice };
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(
    JSON.stringify(value)
  )}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: value }));
  return value;
}

/** Para scripts opcionales que se añadan en el futuro. */
export function hasConsent(category: keyof ConsentChoice): boolean {
  return readConsent()?.[category] === true;
}
