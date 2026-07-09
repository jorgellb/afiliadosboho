"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CategoryIcon } from "./category-icon";

/**
 * Navegación móvil: botón hamburguesa en el cabecero y cajón lateral.
 * En escritorio queda oculto por CSS (la nav clásica sigue mandando).
 *
 * El cajón y su fondo se montan en <body> con un portal: el cabecero es
 * sticky y crea contexto de apilamiento, así que desde dentro no podrían
 * taparse el chat flotante ni el resto de capas fijas.
 */

const LINKS = [
  { href: "/", label: "La tienda", hint: "Todas las piezas" },
  { href: "/encuentra-look", label: "Busca por foto", hint: "Sube una imagen y la buscamos" },
  { href: "/quiz", label: "Tu estilo", hint: "5 preguntas, tu perfil boho" },
  { href: "/revista", label: "Revista", hint: "El diario boho" },
  { href: "/asistente", label: "Estilista", hint: "Consejo a medida" },
];

// Lista propia (no se importa el schema para no arrastrar Drizzle al cliente).
const COLLECTIONS = [
  "vestidos",
  "kimonos",
  "faldas",
  "blusas",
  "pantalones",
  "bolsos",
  "calzado",
  "joyeria",
  "accesorios",
];

export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // El portal necesita el DOM: solo tras hidratar.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Al navegar, el cajón se cierra solo.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Con el cajón abierto: bloqueo del scroll de fondo, foco dentro y Escape cierra.
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = "hidden";
    drawerRef.current?.querySelector("a")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  const isCurrent = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const drawer = (
    <>
      <div className="nav-backdrop" data-open={open} onClick={close} aria-hidden />

      <div
        ref={drawerRef}
        id="mobile-drawer"
        className="nav-drawer"
        data-open={open}
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        inert={!open}
      >
        <div className="nav-drawer-head">
          <p className="nav-drawer-brand">Boho Chic</p>
          <button type="button" aria-label="Cerrar el menú" onClick={close}>
            ✕
          </button>
        </div>

        <nav className="nav-drawer-links" aria-label="Secciones">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={isCurrent(link.href) ? "active" : undefined}
              aria-current={isCurrent(link.href) ? "page" : undefined}
            >
              <span className="nav-drawer-label">{link.label}</span>
              <span className="nav-drawer-hint">{link.hint}</span>
            </Link>
          ))}
        </nav>

        <p className="nav-drawer-title">Colecciones</p>
        <nav className="nav-drawer-cats" aria-label="Colecciones">
          {COLLECTIONS.map((category) => (
            <Link key={category} href={`/?category=${category}`}>
              <CategoryIcon name={category} />
              {category}
            </Link>
          ))}
        </nav>

        <p className="nav-drawer-foot">
          Crochet, flecos y bordados. Nuevas piezas cada semana.
        </p>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className={`nav-toggle${open ? " open" : ""}`}
        aria-expanded={open}
        aria-controls="mobile-drawer"
        aria-label={open ? "Cerrar el menú" : "Abrir el menú"}
        onClick={() => setOpen(!open)}
      >
        <span className="nav-toggle-bars" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>

      {mounted && createPortal(drawer, document.body)}
    </>
  );
}
