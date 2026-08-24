import type { Category } from "@/lib/db/schema";

/**
 * Colecciones: la capa SEO sobre las categorías de la base de datos.
 *
 * Antes las categorías solo existían como parámetro (`/?category=joyeria`),
 * así que las nueve compartían el title y la descripción de la home y ninguna
 * tenía H1 propio. Aquí cada una recibe su URL descriptiva, su title, su meta
 * description, su H1 y una entradilla editorial.
 *
 * El texto describe el ESTILO, que es conocimiento de moda general, y nunca
 * atributos concretos del catálogo (materiales, medidas, composición): esos
 * datos no los da la API del proveedor y afirmarlos sería inventarlos.
 */
export interface Collection {
  /** Segmento de URL: /vestidos-boho */
  slug: string;
  /** Valor de `products.category` en la base de datos. */
  category: Category;
  /** Nombre corto para migas de pan y navegación. */
  name: string;
  /** H1 de la página. */
  heading: string;
  /** <title> único. */
  title: string;
  /** Meta description única. */
  description: string;
  /** Entradilla editorial, un párrafo por elemento. */
  intro: string[];
  /**
   * Colecciones que se combinan de forma natural con esta.
   *
   * No es decoración: da a Google una ruta entre categorías y al visitante el
   * siguiente paso obvio. Se eligen por criterio de estilismo (con qué se
   * lleva), no por similitud de nombre.
   */
  related: string[];
}

export const COLLECTIONS: Collection[] = [
  {
    slug: "vestidos-boho",
    category: "vestidos",
    name: "Vestidos boho",
    heading: "Vestidos boho",
    title: "Vestidos boho para mujer | Boho Chic",
    description:
      "Vestidos de estilo boho chic: cortes largos y midi, tejidos fluidos, crochet y bordados. Una selección revisada pieza a pieza.",
    intro: [
      "El vestido es la prenda que mejor resume el estilo boho: silueta suelta que no marca, largo por debajo de la rodilla y tejidos que se mueven con el aire. Frente a la ropa entallada, aquí manda la comodidad.",
      "Los detalles que suelen definirlo son el crochet, los bordados, el ganchillo en el canesú, las mangas abullonadas y los estampados florales o étnicos. El blanco roto, el tostado y los tonos tierra forman la base cromática habitual.",
      "Para una boda o un evento de día funcionan los largos en tonos claros; para diario, los midi con sandalia plana. Si dudas con la talla, revisa la tabla de medidas del vendedor antes de comprar: en las prendas de corte holgado la referencia europea varía mucho.",
    ],
    related: ["kimonos-boho", "calzado-boho", "joyeria-boho"],
  },
  {
    slug: "blusas-boho",
    category: "blusas",
    name: "Blusas boho",
    heading: "Blusas boho",
    title: "Blusas y tops boho para mujer | Boho Chic",
    description:
      "Blusas boho de corte suelto: mangas amplias, escotes bordados, crochet y tejidos ligeros para combinar todo el año.",
    intro: [
      "La blusa boho es la pieza más versátil del armario bohemio: cambia por completo un vaquero básico y se adapta igual a una falda larga que a un pantalón ancho.",
      "Sus señas de identidad son las mangas anchas o abullonadas, los escotes con cordón, el bordado artesanal y las transparencias suaves. El crochet aparece con frecuencia en hombros y puños.",
      "Un criterio de combinación sencillo: si la blusa lleva mucho volumen arriba, equilibra abajo con una prenda más recta. Y al revés — con falda amplia, mejor un top más ceñido.",
    ],
    related: ["faldas-boho", "pantalones-boho", "joyeria-boho"],
  },
  {
    slug: "faldas-boho",
    category: "faldas",
    name: "Faldas boho",
    heading: "Faldas boho",
    title: "Faldas boho largas y midi | Boho Chic",
    description:
      "Faldas boho de vuelo: largas, midi, con volantes o estampado étnico. Cintura cómoda y caída fluida para diario y verano.",
    intro: [
      "La falda boho busca vuelo y movimiento. Domina el largo midi y maxi, muchas veces con cintura elástica o con cordón, lo que la hace especialmente cómoda.",
      "Los volantes escalonados, el estampado floral, el tie-dye y los bordados en el bajo son recursos habituales. En verano abundan los tejidos ligeros; en entretiempo, se llevan con capas por encima.",
      "Combina bien con un top sencillo y sandalia plana. Si buscas alargar la figura, elige la falda y el calzado en tonos próximos.",
    ],
    related: ["blusas-boho", "calzado-boho", "bolsos-boho"],
  },
  {
    slug: "pantalones-boho",
    category: "pantalones",
    name: "Pantalones boho",
    heading: "Pantalones boho",
    title: "Pantalones boho anchos y fluidos | Boho Chic",
    description:
      "Pantalones boho de pierna ancha, tiro alto y caída suelta. Estampados étnicos y lisos para un look bohemio cómodo.",
    intro: [
      "El pantalón boho apuesta por la pierna ancha, el tiro alto y la caída fluida. Es la alternativa cómoda al vestido cuando quieres el mismo aire bohemio con más libertad de movimiento.",
      "Los cortes más frecuentes son el palazzo, el culotte y el pantalón de pinzas suelto. Los estampados étnicos y los lisos en tonos tierra conviven sin problema.",
      "Al ser prendas anchas, el patrón suele ir holgado de serie: mide un pantalón que ya tengas y compáralo con la tabla del vendedor antes de decidir la talla.",
    ],
    related: ["blusas-boho", "kimonos-boho", "calzado-boho"],
  },
  {
    slug: "kimonos-boho",
    category: "kimonos",
    name: "Kimonos boho",
    heading: "Kimonos boho",
    title: "Kimonos boho y capas bohemias | Boho Chic",
    description:
      "Kimonos boho con flecos, bordados y estampados. La capa ligera que remata cualquier look bohemio, de playa a ciudad.",
    intro: [
      "El kimono es la capa que remata el look boho. No abriga demasiado, y ese es justo su papel: aportar textura, movimiento y una segunda capa visual sin cerrar la silueta.",
      "Los flecos en el bajo, los bordados en la espalda, el encaje y los estampados de inspiración étnica son sus rasgos más reconocibles. Los hay cortos, a la cadera, y largos hasta el tobillo.",
      "Funciona sobre un vestido liso, como salida de playa o sobre vaquero y camiseta para dar carácter a un conjunto básico. Al ir siempre abierto, la talla es mucho menos crítica que en otras prendas.",
    ],
    related: ["vestidos-boho", "bolsos-boho", "accesorios-boho"],
  },
  {
    slug: "bolsos-boho",
    category: "bolsos",
    name: "Bolsos boho",
    heading: "Bolsos boho",
    title: "Bolsos boho de rafia, flecos y crochet | Boho Chic",
    description:
      "Bolsos boho: capazos de rafia, bandoleras con flecos y bolsos de crochet. El complemento que define un look bohemio.",
    intro: [
      "El bolso es donde el estilo boho concentra su artesanía: rafia trenzada, ganchillo, flecos largos y bordados son los recursos más habituales.",
      "El capazo de rafia es el clásico de verano; la bandolera con flecos, la opción de festival; y el bolso de crochet, el que mejor acompaña a un vestido largo.",
      "Antes de comprar conviene mirar las medidas que indique el vendedor: en las fotos de producto la escala engaña con facilidad, y un capazo puede resultar bastante más pequeño de lo que aparenta.",
    ],
    related: ["vestidos-boho", "calzado-boho", "accesorios-boho"],
  },
  {
    slug: "calzado-boho",
    category: "calzado",
    name: "Calzado boho",
    heading: "Calzado boho",
    title: "Calzado boho: sandalias, alpargatas y botines | Boho Chic",
    description:
      "Calzado de estilo boho: sandalias planas de tiras, alpargatas de esparto y botines camperos para looks bohemios.",
    intro: [
      "El calzado boho evita el tacón alto y el acabado brillante. Manda la suela plana o la cuña de esparto, y los acabados envejecidos o en tejido natural.",
      "Las sandalias de tiras y las alpargatas cubren el verano; el botín campero, con o sin flecos, es el que sostiene el look en entretiempo y en festivales.",
      "El tallaje es el punto donde más varía este tipo de calzado. Mide tu pie en centímetros y compáralo con la tabla concreta del vendedor, no con tu talla habitual.",
    ],
    related: ["vestidos-boho", "faldas-boho", "bolsos-boho"],
  },
  {
    slug: "joyeria-boho",
    category: "joyeria",
    name: "Joyería boho",
    heading: "Joyería boho",
    title: "Joyería boho: collares, pendientes y pulseras | Boho Chic",
    description:
      "Joyería de estilo boho: collares largos, pendientes de aro, pulseras trenzadas y piedras naturales para superponer capas.",
    intro: [
      "La joyería boho se lleva por acumulación: varias capas de collares de distinta longitud, pulseras apiladas y anillos en varios dedos. La regla no escrita es que nada tiene que ir a juego.",
      "Predominan los tonos dorados envejecidos y plateados mate, las piedras naturales, los hilos trenzados y los motivos étnicos. Los pendientes tienden a ser grandes: aros, flecos o formas geométricas.",
      "Si el conjunto ya lleva estampado o mucho volumen, baja la cantidad de joyería. Y si tienes la piel sensible, revisa el material que declare el vendedor antes de comprar piezas que vayan pegadas a la piel.",
    ],
    related: ["blusas-boho", "vestidos-boho", "accesorios-boho"],
  },
  {
    slug: "accesorios-boho",
    category: "accesorios",
    name: "Accesorios boho",
    heading: "Accesorios boho",
    title: "Accesorios boho: sombreros, cinturones y pañuelos | Boho Chic",
    description:
      "Accesorios de estilo boho: sombreros de ala ancha, cinturones trenzados, pañuelos y diademas para completar el look.",
    intro: [
      "El accesorio es lo que convierte un conjunto sencillo en un look boho reconocible. Un sombrero de ala ancha o un cinturón trenzado cambian por completo la lectura de un vestido liso.",
      "Entre los más habituales están los sombreros de fibra natural, las diademas y cintas para el pelo, los pañuelos estampados y los cinturones con hebilla trabajada.",
      "Conviene elegir uno como protagonista y dejar el resto en segundo plano: si el sombrero manda, mejor bajar el volumen de la joyería.",
    ],
    related: ["joyeria-boho", "bolsos-boho", "kimonos-boho"],
  },
];

/** Índice por segmento de URL. */
const BY_SLUG = new Map(COLLECTIONS.map((c) => [c.slug, c]));
/** Índice por categoría de la base de datos. */
const BY_CATEGORY = new Map(COLLECTIONS.map((c) => [c.category, c]));

export function getCollectionBySlug(slug: string): Collection | undefined {
  return BY_SLUG.get(slug);
}

export function getCollectionByCategory(
  category: string
): Collection | undefined {
  return BY_CATEGORY.get(category as Category);
}

/**
 * URL pública de una categoría. `otros` no tiene colección propia (no es una
 * familia real, es el cajón de sastre), así que cae al parámetro antiguo, que
 * la home sigue entendiendo.
 */
export function collectionHref(category: string): string {
  const collection = BY_CATEGORY.get(category as Category);
  return collection ? `/${collection.slug}` : `/?category=${category}`;
}
