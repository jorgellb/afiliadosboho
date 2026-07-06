"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChatCore } from "./chat-core";

/**
 * Estilista flotante: burbuja fija abajo a la derecha que despliega un panel
 * de chat. Se mantiene montado al cerrar para conservar la conversación.
 */
export function ChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);

  // Al abrir: foco al campo de texto; Escape cierra y devuelve el foco al botón.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector("input")?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // El admin tiene su propio mundo y /asistente ya es el chat a pantalla completa.
  if (pathname.startsWith("/admin") || pathname === "/asistente") return null;

  return (
    <>
      {everOpened && (
        <div
          ref={panelRef}
          className={`chat-panel${open ? " open" : ""}`}
          role="dialog"
          aria-modal="false"
          aria-label="La estilista virtual"
          aria-hidden={!open}
          // El panel cerrado sigue montado para conservar la conversación;
          // inert lo saca del orden de tabulación y de los lectores.
          inert={!open}
        >
          <header className="chat-panel-head">
            <p>
              <span aria-hidden>✦</span> La estilista
            </p>
            <button
              type="button"
              aria-label="Cerrar el chat"
              onClick={() => {
                setOpen(false);
                fabRef.current?.focus();
              }}
            >
              ✕
            </button>
          </header>
          <ChatCore compact />
        </div>
      )}
      <button
        ref={fabRef}
        type="button"
        className={`chat-fab${open ? " open" : ""}`}
        aria-expanded={open}
        aria-label={open ? "Cerrar la estilista virtual" : "Abrir la estilista virtual"}
        title="La estilista boho ✦ pide consejo"
        onClick={() => {
          setEverOpened(true);
          setOpen(!open);
        }}
      >
        <span aria-hidden>{open ? "✕" : "✦"}</span>
      </button>
    </>
  );
}
