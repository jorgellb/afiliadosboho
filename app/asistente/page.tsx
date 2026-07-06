import type { Metadata } from "next";
import { ChatCore } from "../components/chat-core";

export const metadata: Metadata = {
  title: "La estilista boho — consejos de moda con IA | Boho Chic",
  description:
    "Pide consejo a nuestra estilista virtual: te ayuda a elegir looks boho y te enseña piezas de la tienda según la ocasión y tu presupuesto.",
};

export default function AsistentePage() {
  return (
    <div className="asistente-page">
      <p className="hero-kicker">Consultorio de estilo</p>
      <h1>
        La estilista <em>boho</em>
      </h1>
      <p className="muted">
        Cuéntale qué buscas, para qué ocasión o tu presupuesto, y te propondrá
        piezas de la tienda con consejos para combinarlas.
      </p>
      <ChatCore />
    </div>
  );
}
