import type { Metadata } from "next";
import { FindMyLook } from "./find-my-look";

export const metadata: Metadata = {
  title: "Encuentra este Look — busca ropa boho por foto | Boho Chic",
  description:
    "Sube una foto o captura de un outfit y encontramos las prendas más parecidas de nuestra tienda boho, con su precio. Búsqueda por imagen, gratis.",
};

export default function EncuentraLookPage() {
  return (
    <div className="find-look-page">
      <header className="find-look-head">
        <p className="hero-kicker" style={{ justifyContent: "center" }}>
          Búsqueda por imagen
        </p>
        <h1>
          Encuentra <em>este look</em>
        </h1>
        <p className="muted">
          ¿Has visto un outfit que te enamora en Pinterest o Instagram? Sube la
          captura y te enseñamos las piezas más parecidas de la tienda.
        </p>
      </header>
      <FindMyLook />
    </div>
  );
}
