"use client";
import { useState } from "react";
import { registrarPuente } from "@/app/(dash)/videos/acciones";
import {
  conectarPuente,
  consultarPuente,
  identidadLocal,
} from "@/lib/puente-videos-cliente";
import {
  PUENTE_LOCAL,
  PREFERENCIA_VIDEO_LOCAL,
  codigoEquipoVideo,
  type EstadoPuente,
} from "@/lib/videos-locales";

export function ConfiguracionVideosLocales() {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [estado, setEstado] = useState<EstadoPuente | null>(null);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);
  async function comprobar() {
    setError("");
    setMensaje("");
    setOcupado(true);
    try {
      const c = await conectarPuente();
      setEstado(await consultarPuente(c, "/v1/estado"));
      localStorage.setItem(PREFERENCIA_VIDEO_LOCAL, "1");
      setMensaje(
        `Conectado a ${c.identidad.nombre}. Los expedientes consultarán los videos de esta PC.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar.");
    } finally {
      setOcupado(false);
    }
  }
  async function vincular(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setOcupado(true);
    setError("");
    setMensaje("");
    try {
      const i = await identidadLocal();
      if (codigoEquipoVideo(codigo)?.id !== i.id)
        throw new Error(
          "El código es de otra PC. Usa el que muestra la configuración local de este equipo.",
        );
      const r = await registrarPuente(codigo, nombre.trim() || i.nombre);
      if (!r.ok) throw new Error(r.error);
      setCodigo("");
      localStorage.setItem(PREFERENCIA_VIDEO_LOCAL, "1");
      const c = await conectarPuente();
      setEstado(await consultarPuente(c, "/v1/estado"));
      setMensaje(
        "Esta PC quedó vinculada. Ya puedes abrir un pedido y comprobar sus videos locales.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo vincular.");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <div className="videos-locales-config">
      <section className="vidrio vl-panel">
        <h2>Preparar esta PC</h2>
        <ol>
          <li>
            <a href="/descargas/cation-videos.zip">
              Descargar CATION Videos para Windows
            </a>{" "}
            y extraer el ZIP.
          </li>
          <li>
            Ejecutar <strong>Configurar.ps1</strong>, elegir la carpeta de
            grabaciones y abrir la configuración local.
          </li>
          <li>
            Copiar el código de vinculación que muestra la configuración y
            pegarlo abajo.
          </li>
        </ol>
        <p>
          La carpeta se guarda en esta computadora. Los archivos se reproducen
          desde aquí y no se suben al Dashboard.
        </p>
        <a href={PUENTE_LOCAL} target="_blank" rel="noreferrer">
          Abrir configuración local ↗
        </a>
        <p className="vl-ayuda">
          El paquete necesita Node.js 22 o posterior. La versión portátil con el
          entorno incluido se puede copiar entre PCs Windows x64.
        </p>
      </section>
      <section className="vidrio vl-panel">
        <h2>Vincular esta PC</h2>
        <form onSubmit={vincular} className="vl-formulario">
          <label>
            Nombre del equipo
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={100}
              placeholder="Ej.: PC Almacén Central"
              autoComplete="off"
            />
          </label>
          <label>
            Código de la configuración local
            <textarea
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              maxLength={120}
              rows={3}
              autoComplete="off"
              spellCheck={false}
              required
            />
          </label>
          <button className="boton-vidrio" disabled={ocupado || !codigo.trim()}>
            {ocupado ? "Conectando…" : "Vincular esta PC"}
          </button>
        </form>
        <div className="vl-acciones">
          <button
            className="boton-vidrio"
            disabled={ocupado}
            onClick={comprobar}
          >
            Comprobar conexión
          </button>
          <button
            className="boton-texto"
            onClick={() => {
              localStorage.removeItem(PREFERENCIA_VIDEO_LOCAL);
              setEstado(null);
              setMensaje("Consulta automática desactivada en este navegador.");
            }}
          >
            Desactivar consulta automática
          </button>
        </div>
        <p className="vl-ayuda">
          Al conectar, el navegador puede pedir permiso para acceder al servicio
          de esta PC. Permítelo para consultar la carpeta configurada.
        </p>
        {error ? (
          <p className="vl-error" role="alert">
            {error}
          </p>
        ) : null}
        {mensaje ? (
          <p className="vl-mensaje" role="status">
            {mensaje}
          </p>
        ) : null}
        {estado ? (
          <dl className="vl-estado">
            <dt>Equipo</dt>
            <dd>{estado.equipo.nombre}</dd>
            <dt>Carpeta</dt>
            <dd>
              {estado.configurada
                ? "Configurada en esta PC"
                : "Pendiente de elegir"}
            </dd>
            <dt>Videos identificados</dt>
            <dd>{estado.total}</dd>
            <dt>Lectura de carpeta</dt>
            <dd>
              {estado.escaneando
                ? `En curso · ${estado.revisados} archivos revisados`
                : estado.error || "Completada"}
            </dd>
          </dl>
        ) : null}
      </section>
      <section className="vidrio vl-panel">
        <h2>Cómo se muestran en el expediente</h2>
        <p>
          Abre Pedidos, elige una preparación y entra en Alistado o
          Verificación. Allí puedes vincular un archivo de la carpeta y
          reproducirlo cuando esté disponible en esta PC.
        </p>
        <p>
          El mismo video puede reconocerse en otra computadora aunque esté en
          otra carpeta. Si el archivo falta, el expediente muestra “No
          disponible en esta PC”.
        </p>
        <p className="vl-ayuda">
          MP4 y WebM son los formatos de reproducción recomendados. DAV y otros
          formatos de grabador requieren conversión antes de reproducirse en el
          navegador.
        </p>
        <h3>Recuperación desde grabador · pendiente</h3>
        <p>
          Dahua DHI-XVR5216AN-S2. Falta configurar el acceso y verificar cómo
          exporta las grabaciones. Todavía no se solicitan ni recuperan videos
          del equipo.
        </p>
      </section>
    </div>
  );
}
