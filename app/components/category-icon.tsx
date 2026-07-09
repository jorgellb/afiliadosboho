/**
 * Iconos de categoría: línea fina sobre rejilla de 24×24, sin relleno y con
 * `currentColor`, para que hereden el color del chip (salvia → blanco al
 * activarse). Pensados para leerse bien a 16px.
 */

type IconName =
  | "vestidos"
  | "kimonos"
  | "faldas"
  | "blusas"
  | "pantalones"
  | "bolsos"
  | "calzado"
  | "joyeria"
  | "accesorios"
  | "otros";

const PATHS: Record<IconName, React.ReactNode> = {
  // Vestido: escote en pico suave, talle marcado y falda con vuelo.
  vestidos: (
    <>
      <path d="M9 3.4C9.3 6.2 9.8 8.8 9.9 11.1C8.8 14.6 7.2 17.8 6 20.6Q12 22.5 18 20.6C16.8 17.8 15.2 14.6 14.1 11.1C14.2 8.8 14.7 6.2 15 3.4Q12 7.4 9 3.4Z" />
      <path d="M9.9 11.1H14.1" />
    </>
  ),
  // Kimono: mangas largas y colgantes, cuello cruzado y obi.
  kimonos: (
    <>
      <path d="M8.6 4L3.6 6.5L3.2 13.8H7.4V21H16.6V13.8H20.8L20.4 6.5L15.4 4Z" />
      <path d="M8.6 4L12 11.6L15.4 4" />
      <path d="M7.4 15.2H16.6V17.2H7.4Z" />
    </>
  ),
  // Falda: cinturilla y corte en A.
  faldas: (
    <>
      <path d="M8.4 4.6H15.6V7H8.4Z" />
      <path d="M8.4 7C7.6 11 6.2 15.4 5 19.2Q12 21.6 19 19.2C17.8 15.4 16.4 11 15.6 7" />
    </>
  ),
  // Blusa: escote redondo y manga corta.
  blusas: (
    <path d="M8.6 3.4C8.6 7 15.4 7 15.4 3.4L19.4 5.9L20.6 10.6L17.4 11.6L16.4 9.7V20.6H7.6V9.7L6.6 11.6L3.4 10.6L4.6 5.9Z" />
  ),
  // Pantalón ancho: cinturilla y dos perneras.
  pantalones: (
    <>
      <path d="M7.6 3.8H16.4L17.4 20.4H13.7L12 12.6L10.3 20.4H6.6Z" />
      <path d="M7.6 6.3H16.4" />
    </>
  ),
  // Bolso de asa redonda.
  bolsos: (
    <>
      <path d="M8.8 8.2V6.6A3.2 3.2 0 0 1 15.2 6.6V8.2" />
      <path d="M5.4 8.2H18.6L17.3 20.4H6.7Z" />
    </>
  ),
  // Bota: caña, empeine y suela.
  calzado: (
    <>
      <path d="M8.5 3.4H13.2V12.4C13.2 14.4 15 15.2 17 15.9C18.8 16.5 19.6 17.3 19.6 18.7V20.6H8.5Z" />
      <path d="M8.5 18.6H19.6" />
      <path d="M8.5 6H13.2" />
    </>
  ),
  // Collar: cadena en U honda y colgante redondo.
  joyeria: (
    <>
      <path d="M6 3.6C6 15 18 15 18 3.6" />
      <path d="M9.6 14.6A2.4 2.4 0 1 0 14.4 14.6A2.4 2.4 0 1 0 9.6 14.6" />
    </>
  ),
  // Pamela: copa, cinta y ala.
  accesorios: (
    <>
      <path d="M3.4 15C3.4 16.7 7.2 17.8 12 17.8C16.8 17.8 20.6 16.7 20.6 15C20.6 13.3 16.8 12.2 12 12.2C7.2 12.2 3.4 13.3 3.4 15Z" />
      <path d="M7.4 13.2C7.4 8.4 9.4 5.4 12 5.4C14.6 5.4 16.6 8.4 16.6 13.2" />
      <path d="M7.7 11.8C9.3 12.6 14.7 12.6 16.3 11.8" />
    </>
  ),
  // Destello (el ✦ de la marca).
  otros: (
    <path d="M12 3C12.7 8.2 15.8 11.3 21 12C15.8 12.7 12.7 15.8 12 21C11.3 15.8 8.2 12.7 3 12C8.2 11.3 11.3 8.2 12 3Z" />
  ),
};

export function CategoryIcon({ name }: { name: string }) {
  const paths = PATHS[name as IconName] ?? PATHS.otros;
  return (
    <svg
      className="cat-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {paths}
    </svg>
  );
}
