import type { Category } from "@/lib/db/schema";

/**
 * Quiz "Descubre tu estilo boho". La definición vive aquí (datos planos, se
 * importa también en el cliente) para que cliente y servidor puntúen igual.
 */

export type ProfileKey = "playero" | "festival" | "elegante" | "cotidiano";

export const PROFILES: Record<
  ProfileKey,
  { name: string; tagline: string; categories: Category[] }
> = {
  playero: {
    name: "Boho Playero",
    tagline:
      "Tejidos que vuelan, crochet y tonos crudos. Tu sitio es la arena y el atardecer.",
    categories: ["vestidos", "kimonos", "calzado", "bolsos"],
  },
  festival: {
    name: "Espíritu Festival",
    tagline:
      "Flecos, estampados y actitud. Vas a bailar hasta que salga el sol.",
    categories: ["faldas", "accesorios", "vestidos", "joyeria"],
  },
  elegante: {
    name: "Boho Chic de Gala",
    tagline:
      "Vestidos largos, joyas de capas y caída impecable. Boho que sabe brillar.",
    categories: ["vestidos", "joyeria", "bolsos", "calzado"],
  },
  cotidiano: {
    name: "Boho de Diario",
    tagline:
      "Blusas bordadas, prendas cómodas y ese aire libre incluso entre semana.",
    categories: ["blusas", "pantalones", "kimonos", "accesorios"],
  },
};

export interface QuizOption {
  label: string;
  profile: ProfileKey;
  categories?: Category[];
  maxPrice?: number;
}

export interface QuizQuestion {
  question: string;
  options: QuizOption[];
}

export const QUESTIONS: QuizQuestion[] = [
  {
    question: "Tu plan boho ideal es…",
    options: [
      { label: "Un día de playa y chiringuito", profile: "playero" },
      { label: "Un festival de música", profile: "festival" },
      { label: "Una boda o evento al atardecer", profile: "elegante" },
      { label: "Un café y pasear por la ciudad", profile: "cotidiano" },
    ],
  },
  {
    question: "La prenda que nunca falta en tu maleta…",
    options: [
      { label: "Un vestido largo y fresco", profile: "playero", categories: ["vestidos"] },
      { label: "Una falda con mucho vuelo", profile: "festival", categories: ["faldas"] },
      { label: "Un vestido de gala boho", profile: "elegante", categories: ["vestidos"] },
      { label: "Una blusa bordada versátil", profile: "cotidiano", categories: ["blusas"] },
    ],
  },
  {
    question: "Tu paleta de color…",
    options: [
      { label: "Tierra, crudo y arena", profile: "playero" },
      { label: "Colores vivos y estampados", profile: "festival" },
      { label: "Negro, vino y dorado", profile: "elegante" },
      { label: "Pasteles y tonos suaves", profile: "cotidiano" },
    ],
  },
  {
    question: "¿Cuánto sueles gastar por pieza?",
    options: [
      { label: "Menos de 20 €", profile: "cotidiano", maxPrice: 20 },
      { label: "Entre 20 y 40 €", profile: "playero", maxPrice: 40 },
      { label: "Entre 40 y 70 €", profile: "festival", maxPrice: 70 },
      { label: "Lo que haga falta por la pieza perfecta", profile: "elegante" },
    ],
  },
  {
    question: "Tu accesorio talismán…",
    options: [
      { label: "Un sombrero de ala ancha", profile: "playero", categories: ["accesorios"] },
      { label: "Un bolso de flecos", profile: "festival", categories: ["bolsos"] },
      { label: "Joyas de muchas capas", profile: "elegante", categories: ["joyeria"] },
      { label: "Unas sandalias planas cómodas", profile: "cotidiano", categories: ["calzado"] },
    ],
  },
];

export interface QuizResult {
  profile: ProfileKey;
  categories: Category[];
  maxPrice: number | null;
}

/** Puntúa las respuestas (índices por pregunta) y devuelve el perfil ganador. */
export function computeResult(answers: number[]): QuizResult {
  const score: Record<ProfileKey, number> = {
    playero: 0,
    festival: 0,
    elegante: 0,
    cotidiano: 0,
  };
  const categories = new Set<Category>();
  let maxPrice: number | null = null;

  answers.forEach((choice, i) => {
    const option = QUESTIONS[i]?.options[choice];
    if (!option) return;
    score[option.profile] += 1;
    option.categories?.forEach((c) => categories.add(c));
    if (option.maxPrice !== undefined) {
      maxPrice = maxPrice === null ? option.maxPrice : Math.max(maxPrice, option.maxPrice);
    }
  });

  const profile = (Object.keys(score) as ProfileKey[]).reduce((a, b) =>
    score[b] > score[a] ? b : a
  );
  // Categorías del perfil + las elegidas explícitamente en las respuestas.
  PROFILES[profile].categories.forEach((c) => categories.add(c));

  return { profile, categories: [...categories], maxPrice };
}
