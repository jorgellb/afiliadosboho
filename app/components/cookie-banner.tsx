"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ACCEPT_ALL,
  CONSENT_EVENT,
  Consent,
  ConsentChoice,
  OPEN_SETTINGS_EVENT,
  REJECT_ALL,
  readConsent,
  writeConsent,
} from "@/lib/consent";

/** El store externo es la cookie; writeConsent avisa con CONSENT_EVENT. */
function subscribeConsent(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_EVENT, onChange);
}

/**
 * Aviso de cookies. Criterios de la AEPD que condicionan el diseño:
 * - "Aceptar" y "Rechazar" tienen el mismo peso visual y están en la primera
 *   capa. Rechazar no cuesta más clics que aceptar.
 * - No hay aspa de cerrar: cerrar o seguir navegando no equivale a consentir.
 * - Nada opcional viene premarcado y no hay muro de cookies: la web se usa igual.
 */
export function CookieBanner() {
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [choice, setChoice] = useState<ConsentChoice>(REJECT_ALL);
  const panelRef = useRef<HTMLDivElement>(null);
  // El panel es zona autenticada: ahí el aviso solo estorba (tapaba el editor).
  const inAdmin = pathname.startsWith("/admin");

  // La decisión vive en la cookie, no en React: se lee como store externo en
  // vez de copiarla a un estado desde un efecto. El snapshot de servidor dice
  // "ya decidió" para que el aviso no viaje en el HTML y no parpadee a quien
  // ya respondió; tras hidratar se corrige solo. writeConsent emite
  // CONSENT_EVENT, así que guardar cierra el aviso sin estado extra.
  const decided = useSyncExternalStore(
    subscribeConsent,
    () => readConsent() !== null,
    () => true
  );
  const open = !inAdmin && (settingsOpen || !decided);

  useEffect(() => {
    function onOpenSettings() {
      const saved: Consent | null = readConsent();
      setChoice(saved ? { analytics: saved.analytics, personalization: saved.personalization } : REJECT_ALL);
      setConfiguring(true);
      setSettingsOpen(true);
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpenSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpenSettings);
  }, []);

  // Escape sale del detalle, pero nunca cierra el aviso sin decisión: no
  // decidir no puede interpretarse como aceptar.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector("button")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && configuring) setConfiguring(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, configuring]);

  const decide = (value: ConsentChoice) => {
    writeConsent(value);
    setSettingsOpen(false);
    setConfiguring(false);
  };

  if (inAdmin || !open) return null;

  return (
    <div
      ref={panelRef}
      className="cookie-banner"
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      aria-describedby="cookie-text"
    >
      <p className="cookie-title" id="cookie-title">
        Un momento sobre las cookies
      </p>

      {!configuring ? (
        <>
          <p className="cookie-text" id="cookie-text">
            Usamos solo cookies técnicas, necesarias para que la web funcione y
            para evitar abusos del buscador por imagen. No usamos analítica,
            publicidad ni perfilado. Puedes leer la{" "}
            <Link href="/cookies">política de cookies</Link> y la{" "}
            <Link href="/privacidad">política de privacidad</Link>.
          </p>
          <div className="cookie-actions">
            <button type="button" className="cookie-accept" onClick={() => decide(ACCEPT_ALL)}>
              Aceptar todas
            </button>
            <button type="button" className="cookie-reject" onClick={() => decide(REJECT_ALL)}>
              Rechazar todas
            </button>
            <button type="button" className="cookie-config" onClick={() => setConfiguring(true)}>
              Configurar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="cookie-text" id="cookie-text">
            Elige qué categorías permites. Hoy no usamos ninguna cookie de las
            dos categorías opcionales; si algún día las incorporamos, solo se
            instalarán con tu permiso.
          </p>

          <ul className="cookie-groups">
            <li>
              <label>
                <input type="checkbox" checked disabled />
                <span>
                  <strong>Necesarias</strong>
                  <em>
                    Sesión del panel, límite de búsquedas por imagen y esta
                    misma elección. Sin ellas la web no funciona.
                  </em>
                </span>
              </label>
            </li>
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={choice.analytics}
                  onChange={(e) => setChoice({ ...choice, analytics: e.target.checked })}
                />
                <span>
                  <strong>Medición</strong>
                  <em>Estadísticas de uso para mejorar la tienda. Ninguna en uso.</em>
                </span>
              </label>
            </li>
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={choice.personalization}
                  onChange={(e) => setChoice({ ...choice, personalization: e.target.checked })}
                />
                <span>
                  <strong>Personalización</strong>
                  <em>Recordar tus preferencias de estilo. Ninguna en uso.</em>
                </span>
              </label>
            </li>
          </ul>

          <div className="cookie-actions">
            <button type="button" className="cookie-accept" onClick={() => decide(choice)}>
              Guardar preferencias
            </button>
            <button type="button" className="cookie-reject" onClick={() => decide(REJECT_ALL)}>
              Rechazar todas
            </button>
            <button type="button" className="cookie-config" onClick={() => setConfiguring(false)}>
              Volver
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Enlace del pie para volver a abrir el panel y retirar el consentimiento. */
export function CookieSettingsLink() {
  return (
    <button
      type="button"
      className="cookie-settings-link"
      onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}
    >
      Configurar cookies
    </button>
  );
}
