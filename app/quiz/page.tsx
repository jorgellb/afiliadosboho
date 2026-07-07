import type { Metadata } from "next";
import { QuizClient } from "./quiz-client";

export const metadata: Metadata = {
  title: "Descubre tu estilo boho — test de moda | Boho Chic",
  description:
    "Haz nuestro test de estilo boho en 5 preguntas y recibe una selección de piezas hecha a tu medida. ¿Playera, festivalera, de gala o de diario?",
};

export default function QuizPage() {
  return <QuizClient />;
}
