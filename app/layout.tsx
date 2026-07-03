import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Boho Chic — Tienda de moda boho",
  description:
    "Buscador y tienda de ropa estilo boho chic con las mejores ofertas de Amazon y AliExpress.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <header className="site-header">
          <Link href="/" className="logo">
            Boho Chic
          </Link>
        </header>
        <main>{children}</main>
        <footer className="site-footer">
          <p>
            Los enlaces de esta tienda son enlaces de afiliado: si compras a
            través de ellos, podemos recibir una comisión sin coste adicional
            para ti.
          </p>
        </footer>
      </body>
    </html>
  );
}
