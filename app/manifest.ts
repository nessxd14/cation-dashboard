import type { MetadataRoute } from "next";

/** Permite "Agregar a pantalla de inicio" en el celular: abre como app, sin barra del navegador. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dashboard CATION",
    short_name: "CATION",
    description: "Ventas, almacén y finanzas de CATION en un solo lugar",
    start_url: "/",
    display: "standalone",
    background_color: "#070b18",
    theme_color: "#070b18",
    lang: "es",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
