import { ConfiguracionVideosLocales } from "@/components/ConfiguracionVideosLocales";
export default function VideosPage() {
  return (
    <>
      <header className="encabezado">
        <div>
          <h1>Videos locales</h1>
          <p className="subtitulo">
            Carpeta y conexión de esta PC · reproducción en el expediente
          </p>
        </div>
      </header>
      <ConfiguracionVideosLocales />
    </>
  );
}
