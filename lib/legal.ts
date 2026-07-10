/**
 * Datos legales del sitio: identidad del responsable y medio de contacto,
 * obligatorios por el art. 13 RGPD y el art. 10 LSSI-CE.
 */
export const LEGAL = {
  /** Razón social: es la entidad titular del CIF y la responsable. */
  owner: "Boho Chic España, S.L.",
  /** Nombre comercial con el que opera la tienda. */
  tradeName: "Boho Chic España",
  nif: "B90344300",
  address: "Calle Alborada, 4, 04621 Vera, Almería, España",
  email: "info@bohochic.es",
  site: "bohochic.es",
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
  {
    name: "Resend (Plus Five Five, Inc.)",
    role: "Envío de los correos del boletín y de los avisos de la tienda",
    country: "UE (Irlanda)",
  },
] as const;
