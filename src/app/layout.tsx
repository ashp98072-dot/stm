import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "STM | Punto de venta",
  description: "Gestión de ventas, inventario y clientes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
