/**
 * Datos legales del sitio.
 *
 * ⚠️ RELLENAR ANTES DE PUBLICAR: la identidad del responsable y un medio de
 * contacto son obligatorios (art. 13 RGPD y art. 10 LSSI-CE). Los corchetes
 * marcan lo que falta.
 */
export const LEGAL = {
  owner: "[NOMBRE Y APELLIDOS O RAZÓN SOCIAL]",
  nif: "[NIF / CIF]",
  address: "[DOMICILIO COMPLETO]",
  email: "[CORREO DE CONTACTO]",
  /** Fecha de la última revisión de las políticas. */
  updated: "10 de julio de 2026",
} as const;

/** Encargados del tratamiento y terceros implicados. */
export const PROCESSORS = [
  {
    name: "Vercel Inc.",
    role: "Alojamiento de la web y registros del servidor",
    country: "EE. UU.",
  },
  {
    name: "Neon Inc.",
    role: "Base de datos (catálogo, suscripciones, estadísticas)",
    country: "UE / EE. UU.",
  },
  {
    name: "NVIDIA Corporation",
    role: "Modelos de inteligencia artificial (estilista, búsqueda por imagen y redacción de la revista)",
    country: "EE. UU.",
  },
  {
    name: "Upstash Inc.",
    role: "Caché temporal de resultados del catálogo (si está activada)",
    country: "UE / EE. UU.",
  },
] as const;
