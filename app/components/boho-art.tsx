/**
 * Motivos decorativos setenteros: sol de rayos, arcoíris, margarita, luna,
 * mandala, pluma, seta, mariposa y ondas.
 *
 * Son SVG en línea, no imágenes: heredan `currentColor`, escalan sin pesar un
 * solo byte de red y se pintan con el mismo CSS que el resto. Van todos con
 * `aria-hidden` porque son ornamento — quien navega con lector de pantalla no
 * gana nada oyendo "sol decorativo" catorce veces por página.
 *
 * El trazo va en `vector-effect: non-scaling-stroke` para que una misma pieza
 * se vea igual de fina a 24 px que a 400.
 */

interface ArtProps {
  className?: string;
  /** Grosor del trazo sobre la rejilla de 100×100. */
  stroke?: number;
}

const base = (className?: string) => ({
  viewBox: "0 0 100 100",
  className,
  "aria-hidden": true,
  focusable: false as const,
  xmlns: "http://www.w3.org/2000/svg",
});

/** Sol de rayos: el motivo central del imaginario setentero. */
export function SunBurst({ className, stroke = 2 }: ArtProps) {
  const rays = Array.from({ length: 16 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 16;
    const largo = i % 2 === 0 ? 46 : 39;
    return {
      x1: 50 + Math.cos(angle) * 27,
      y1: 50 + Math.sin(angle) * 27,
      x2: 50 + Math.cos(angle) * largo,
      y2: 50 + Math.sin(angle) * largo,
    };
  });
  return (
    <svg {...base(className)} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round">
      <circle cx="50" cy="50" r="21" />
      {/* Franjas interiores: el sol "a rayas" tan de los setenta. */}
      <path d="M32 43h36M30 50h40M32 57h36" opacity="0.55" />
      {rays.map((r, i) => (
        <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
      ))}
    </svg>
  );
}

/** Arcoíris de arcos concéntricos. */
export function Rainbow({ className, stroke = 3 }: ArtProps) {
  return (
    <svg {...base(className)} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round">
      <path d="M12 76a38 38 0 0 1 76 0" />
      <path d="M24 76a26 26 0 0 1 52 0" opacity="0.7" />
      <path d="M36 76a14 14 0 0 1 28 0" opacity="0.45" />
    </svg>
  );
}

/** Margarita de ocho pétalos. */
export function Daisy({ className, stroke = 2 }: ArtProps) {
  const petals = Array.from({ length: 8 }, (_, i) => (i * 360) / 8);
  return (
    <svg {...base(className)} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round">
      {petals.map((deg) => (
        <ellipse key={deg} cx="50" cy="28" rx="9" ry="18" transform={`rotate(${deg} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="7" />
    </svg>
  );
}

/** Luna creciente con estrellas. */
export function MoonStars({ className, stroke = 2 }: ArtProps) {
  return (
    <svg {...base(className)} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M62 20a32 32 0 1 0 20 46A34 34 0 0 1 62 20Z" />
      <path d="M26 26l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5Z" />
      <path d="M78 78l1.8 4.4 4.4 1.8-4.4 1.8-1.8 4.4-1.8-4.4-4.4-1.8 4.4-1.8Z" opacity="0.7" />
    </svg>
  );
}

/** Mandala de pétalos superpuestos. */
export function Mandala({ className, stroke = 1.6 }: ArtProps) {
  const petals = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
  return (
    <svg {...base(className)} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round">
      <circle cx="50" cy="50" r="46" opacity="0.35" />
      <circle cx="50" cy="50" r="34" opacity="0.5" />
      {petals.map((deg) => (
        <path
          key={deg}
          d="M50 16c7 9 7 18 0 27c-7-9-7-18 0-27Z"
          transform={`rotate(${deg} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="8" />
      <circle cx="50" cy="50" r="3" />
    </svg>
  );
}

/** Pluma de nervadura abierta. */
export function Feather({ className, stroke = 2 }: ArtProps) {
  const barbs = Array.from({ length: 9 }, (_, i) => 22 + i * 6.5);
  return (
    <svg {...base(className)} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round">
      <path d="M50 12c14 16 14 44 0 66c-14-22-14-50 0-66Z" />
      <path d="M50 20v68" />
      {barbs.map((y, i) => {
        const w = 13 - Math.abs(i - 4) * 1.7;
        return <path key={y} d={`M50 ${y}l-${w} ${w * 0.55}M50 ${y}l${w} ${w * 0.55}`} opacity="0.55" />;
      })}
    </svg>
  );
}

/** Seta de lunares, icono pop de los setenta. */
export function Mushroom({ className, stroke = 2 }: ArtProps) {
  return (
    <svg {...base(className)} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 48a34 26 0 0 1 68 0Z" />
      <path d="M40 48c0 16-2 26-5 34h30c-3-8-5-18-5-34" />
      <circle cx="36" cy="36" r="4.5" opacity="0.6" />
      <circle cx="58" cy="31" r="3.5" opacity="0.6" />
      <circle cx="68" cy="41" r="3" opacity="0.6" />
    </svg>
  );
}

/** Mariposa simétrica. */
export function Butterfly({ className, stroke = 2 }: ArtProps) {
  return (
    <svg {...base(className)} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M50 30c-8-14-30-18-38-6c-7 11 4 22 16 24c-11 4-18 14-11 22c8 9 26 1 33-14Z" />
      <path d="M50 30c8-14 30-18 38-6c7 11-4 22-16 24c11 4 18 14 11 22c-8 9-26 1-33-14Z" />
      <path d="M50 28v46" />
      <path d="M50 28l-7-12M50 28l7-12" />
    </svg>
  );
}

/** Ondas apiladas, para separar secciones. */
export function Waves({ className, stroke = 2.4 }: ArtProps) {
  return (
    <svg
      viewBox="0 0 240 40"
      className={className}
      aria-hidden
      focusable={false}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
    >
      <path d="M0 14q15-12 30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0" />
      <path d="M0 27q15-12 30 0t30 0t30 0t30 0t30 0t30 0t30 0t30 0" opacity="0.5" />
    </svg>
  );
}

/**
 * Separador de sección: una onda con un motivo centrado.
 *
 * Rompe el ritmo de "bloque, bloque, bloque" sin meter una imagen que haya que
 * descargar.
 */
export function Divider({
  motif = "sun",
  className,
}: {
  motif?: "sun" | "daisy" | "moon" | "mandala";
  className?: string;
}) {
  const Motif =
    motif === "daisy" ? Daisy : motif === "moon" ? MoonStars : motif === "mandala" ? Mandala : SunBurst;
  return (
    <div className={`boho-divider${className ? ` ${className}` : ""}`} aria-hidden>
      <span className="boho-divider-line" />
      <Motif className="boho-divider-motif" />
      <span className="boho-divider-line" />
    </div>
  );
}
