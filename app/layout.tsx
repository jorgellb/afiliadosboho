import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Mulish } from "next/font/google";
import { ChatWidget } from "./components/chat-widget";
import { CookieBanner, CookieSettingsLink } from "./components/cookie-banner";
import { MobileNav } from "./components/mobile-nav";
import { Waves } from "./components/boho-art";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

// Fraunces: serif suave y cálida (boho amable) para títulos.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

// Mulish: sans humanista, redondeada y limpia para el texto.
const mulish = Mulish({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  // Base para resolver canónicas y Open Graph relativos a URL absoluta.
  metadataBase: new URL(SITE_URL),
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
    <html lang="es" className={`${fraunces.variable} ${mulish.variable}`}>
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
          <MobileNav />
        </header>
        <main>{children}</main>
        {/* Ondas de cierre: separan el pie del contenido sin una linea dura. */}
        <Waves className="boho-art footer-waves" />
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
                <Link href="/vestidos-boho">Vestidos boho</Link> ·{" "}
                <Link href="/kimonos-boho">Kimonos boho</Link> ·{" "}
                <Link href="/faldas-boho">Faldas boho</Link> ·{" "}
                <Link href="/joyeria-boho">Joyería boho</Link>
              </p>
            </div>
            <div>
              <p className="footer-title">Transparencia</p>
              <p>
                Los enlaces de esta tienda son enlaces de afiliado: si compras
                a través de ellos, podemos recibir una comisión sin coste
                adicional para ti.
              </p>
              <p className="footer-legal">
                <Link href="/privacidad">Privacidad</Link> ·{" "}
                <Link href="/cookies">Cookies</Link> · <CookieSettingsLink />
              </p>
            </div>
          </div>
        </footer>
        <ChatWidget />
        <CookieBanner />
      </body>
    </html>
  );
}
