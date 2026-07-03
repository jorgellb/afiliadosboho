import Link from "next/link";
import { LogoutButton } from "./logout-button";

export const metadata = { title: "Admin — Boho Chic" };

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div>
      <nav className="admin-nav">
        <strong>Admin</strong>
        <Link href="/admin">Dashboard</Link>
        <Link href="/admin/search">Buscar productos</Link>
        <Link href="/admin/products">Gestionar productos</Link>
        <Link href="/">Ver tienda</Link>
        <LogoutButton />
      </nav>
      {children}
    </div>
  );
}
