import Link from "next/link";
import { LogoutButton } from "./logout-button";

export const metadata = { title: "Panel de administración — Boho Chic" };

export default function AdminPanelLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="admin-shell">
      <aside className="admin-aside">
        <p className="admin-brand">
          Boho Chic
          <span>Panel de administración</span>
        </p>
        <nav className="admin-menu">
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/products">Productos</Link>
          <Link href="/admin/seo">Salud SEO</Link>
          <Link href="/admin/search">Buscar en AliExpress</Link>
        </nav>
        <div className="admin-aside-foot">
          <Link href="/" target="_blank">
            Ver tienda ↗
          </Link>
          <LogoutButton />
        </div>
      </aside>
      <section className="admin-content">{children}</section>
    </div>
  );
}
