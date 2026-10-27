import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
// Fuentes empaquetadas en el propio build (sin depender de Google Fonts en tiempo de build).
import "@fontsource-variable/manrope/wght.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard CATION",
  description: "Ventas, almacén y finanzas de CATION en un solo lugar",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "CATION", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#070b18",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const liviano = (await cookies()).get("lite")?.value === "1";

  return (
    <html lang="es">
      <body className={liviano ? "liviano" : undefined}>{children}</body>
    </html>
  );
}
