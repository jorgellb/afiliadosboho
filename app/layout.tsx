import type { Metadata } from "next";
import Link from "next/link";
import { Playfair_Display, Manrope } from "next/font/google";
import { ChatWidget } from "./components/chat-widget";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"],
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Boho Chic — Tienda de moda boho",
  description:
    "Buscador y tienda de moda boho chic: vestidos, kimonos, faldas y accesorios seleccionados a los mejores precios.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${playfair.variable} ${manrope.variable}`}>
      <body>
        <header className="site-header">
          <p className="masthead-kicker">Edición boho · desde 2026</p>
          <Link href="/" className="logo">
            Boho&nbsp;Chic
          </Link>
          <nav className="masthead-nav">
            <Link href="/">La tienda</Link>
            <span aria-hidden>·</span>
            <Link href="/encuentra-look">Busca por foto</Link>
            <span aria-hidden>·</span>
            <Link href="/quiz">Tu estilo</Link>
            <span aria-hidden>·</span>
            <Link href="/revista">Revista</Link>
            <span aria-hidden>·</span>
            <Link href="/asistente">Estilista</Link>
          </nav>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <p className="footer-wordmark" aria-hidden>
            Boho Chic
          </p>
          <div className="footer-grid">
            <div>
              <p className="footer-logo">Boho Chic</p>
              <p>
                Una selección viva de moda bohemia: crochet, flecos, bordados y
                vestidos que huelen a sal y a festival.
              </p>
            </div>
            <div>
              <p className="footer-title">Colecciones</p>
              <p>
                <Link href="/?category=vestidos">Vestidos</Link> ·{" "}
                <Link href="/?category=kimonos">Kimonos</Link> ·{" "}
                <Link href="/?category=faldas">Faldas</Link> ·{" "}
                <Link href="/?category=joyeria">Joyería</Link>
              </p>
            </div>
            <div>
              <p className="footer-title">Transparencia</p>
              <p>
                Los enlaces de esta tienda son enlaces de afiliado: si compras
                a través de ellos, podemos recibir una comisión sin coste
                adicional para ti.
              </p>
            </div>
          </div>
        </footer>
        <ChatWidget />
      </body>
    </html>
  );
}
