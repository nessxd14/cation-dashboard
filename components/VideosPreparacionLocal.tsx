"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  conectarPuente,
  consultarPuente,
  permisoLocalConcedido,
  reproducirLocal,
  type ConexionLocal,
} from "@/lib/puente-videos-cliente";
import {
  PREFERENCIA_VIDEO_LOCAL,
  PUENTE_LOCAL,
  tamanoVideo,
  type ArchivoLocal,
  type EstadoPuente,
  type VideoLocal,
} from "@/lib/videos-locales";
import {
  vincularVideoLocal,
  desvincularVideoLocal,
} from "@/app/(dash)/videos/acciones";
import { fechaWholesale } from "@/lib/wholesale";
import { ClipsPreparacionLocal } from "./ClipsPreparacionLocal";
import type { PreparacionLocal } from "@/lib/videos-locales";

function ReproductorLocal({
  video,
  archivo,
  conexion,
}: {
  video: VideoLocal;
  archivo: ArchivoLocal;
  conexion: ConexionLocal;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const player = useRef<HTMLVideoElement>(null);
  const posicion = useRef(0);
  async function abrir() {
    setCargando(true);
    setError("");
    posicion.current = player.current?.currentTime || 0;
    try {
      const r = await reproducirLocal(conexion, video.archivo_clave);
      setUrl(r.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el video.");
      setUrl("");
    } finally {
      setCargando(false);
    }
  }
  return (
    <div className="vl-reproductor">
      {url && archivo.reproducible ? (
        <video
          ref={player}
          controls
          preload="metadata"
          crossOrigin="anonymous"
          src={url}
          aria-label={`Video local ${video.camara}`}
          onLoadedMetadata={() => {
            if (player.current && posicion.current > 0)
              player.current.currentTime = posicion.current;
          }}
          onError={() =>
            setError(
              "No se pudo reproducir. El archivo puede haber cambiado, el enlace puede haber vencido o su formato puede requerir conversión.",
            )
          }
        />
      ) : null}
      <div className="vl-acciones">
        <button
          className="boton-vidrio"
          type="button"
          disabled={cargando}
          onClick={abrir}
        >
          {cargando
            ? "Abriendo…"
            : url
              ? "Renovar enlace local"
              : archivo.reproducible
                ? "Reproducir video"
                : "Preparar descarga local"}
        </button>
        {url && !archivo.reproducible ? (
          <a href={url} download target="_blank" rel="noreferrer">
            Descargar de esta PC
          </a>
        ) : null}
      </div>
      {!archivo.reproducible ? (
        <p className="vl-ayuda">
          Este formato requiere conversión para reproducirse en el navegador.
        </p>
      ) : null}
      {error ? (
        <p className="vl-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
export function VideosPreparacionLocal({
  pedido,
  preparacion,
  videos,
}: {
  pedido: string;
  preparacion: string;
  videos: VideoLocal[];
}) {
  const router = useRouter();
  const [conexion, setConexion] = useState<ConexionLocal | null>(null);
  const [estado, setEstado] = useState<EstadoPuente | null>(null);
  const [disponibles, setDisponibles] = useState<ArchivoLocal[] | null>(null);
  const [automatica, setAutomatica] = useState<PreparacionLocal | null>(null);
  const [avisoGrabador, setAvisoGrabador] = useState("");
  const [archivos, setArchivos] = useState<ArchivoLocal[]>([]),
    [buscar, setBuscar] = useState(""),
    [pagina, setPagina] = useState(1),
    [total, setTotal] = useState(0),
    [elegir, setElegir] = useState(false),
    [seleccion, setSeleccion] = useState("");
  const [error, setError] = useState(""),
    [mensaje, setMensaje] = useState(""),
    [ocupado, setOcupado] = useState(false);
  const referencias = videos.filter((v) => v.preparacion_id === preparacion);
  const referenciasKey = referencias.map((v) => v.archivo_clave).join(",");
  const revision = useRef(0);
  async function comprobar() {
    const actual = ++revision.current;
    setOcupado(true);
    setError("");
    try {
      const c = await conectarPuente();
      const r = await consultarPuente<
        EstadoPuente & { archivos: ArchivoLocal[] }
      >(c, "/v1/disponibles", {
        claves: referencias.map((v) => v.archivo_clave),
      });
      if (actual !== revision.current) return;
      setConexion(c);
      setDisponibles(r.archivos);
      setEstado(r);
      try {
        const resultado = await consultarPuente<PreparacionLocal>(c, "/v1/preparacion", { pedido, preparacion });
        if (actual !== revision.current) return;
        setAutomatica(resultado);
        setEstado(resultado);
        setAvisoGrabador("");
      } catch {
        if (actual !== revision.current) return;
        setAutomatica(null);
        setAvisoGrabador("Actualiza CATION Videos para encontrar automáticamente los clips del grabador.");
      }
      localStorage.setItem(PREFERENCIA_VIDEO_LOCAL, "1");
    } catch (e) {
      if (actual !== revision.current) return;
      setConexion(null);
      setDisponibles(null);
      setAutomatica(null);
      setError(
        e instanceof Error ? e.message : "No se pudo consultar esta PC.",
      );
    } finally {
      if (actual === revision.current) setOcupado(false);
    }
  }
  useEffect(() => {
    let actual = true;
    setDisponibles(null);
    setAutomatica(null);
    setAvisoGrabador("");
    setElegir(false);
    setSeleccion("");
    if (localStorage.getItem(PREFERENCIA_VIDEO_LOCAL) === "1")
      void permisoLocalConcedido().then((granted) => {
        if (actual && granted) void comprobar();
      });
    return () => {
      actual = false;
      revision.current++;
    };
  }, [preparacion, referenciasKey]);
  useEffect(() => {
    if (!automatica?.escaneando) return;
    const timer = setTimeout(() => void comprobar(), 4000);
    return () => clearTimeout(timer);
  }, [automatica]);
  async function biblioteca(p = 1) {
    if (!conexion) return;
    setOcupado(true);
    setError("");
    try {
      const r = await consultarPuente<
        EstadoPuente & { filas: ArchivoLocal[]; total_filtrado: number }
      >(
        conexion,
        `/v1/archivos?${new URLSearchParams({ buscar, pagina: String(p) })}`,
      );
      setArchivos(r.filas);
      setTotal(r.total_filtrado);
      setEstado(r);
      setPagina(p);
      setSeleccion("");
      setElegir(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la carpeta.");
    } finally {
      setOcupado(false);
    }
  }
  async function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      a = archivos.find((a) => a.clave === seleccion);
    if (!a) return;
    setOcupado(true);
    setError("");
    setMensaje("");
    try {
      const r = await vincularVideoLocal({
        pedido,
        preparacion,
        archivo: a.clave,
        nombre: a.nombre,
        bytes: a.bytes,
        camara: String(f.get("camara") || ""),
        inicio: String(f.get("inicio") || ""),
        fin: String(f.get("fin") || ""),
      });
      if (!r.ok) throw new Error(r.error);
      setElegir(false);
      setMensaje("Video vinculado a esta preparación.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo vincular.");
    } finally {
      setOcupado(false);
    }
  }
  async function quitar(id: string) {
    setOcupado(true);
    const r = await desvincularVideoLocal(id);
    if (!r.ok) setError(r.error);
    else router.refresh();
    setOcupado(false);
  }
  async function reindexar() {
    if (!conexion) return;
    setOcupado(true);
    try {
      setEstado(await consultarPuente(conexion, "/v1/escanear", {}));
      setMensaje(
        "Lectura de carpeta iniciada. Vuelve a comprobar cuando termine.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    } finally {
      setOcupado(false);
    }
  }
  return (
    <section className="vl-preparacion" aria-label="Videos de esta PC">
      <h4>Videos de esta PC</h4>
      <p className="fila-sub">
        El archivo se reproduce desde la carpeta configurada en esta
        computadora.
      </p>
      <div className="vl-acciones">
        <button
          className="boton-vidrio"
          disabled={ocupado}
          type="button"
          onClick={comprobar}
        >
          {ocupado ? "Consultando…" : "Comprobar en esta PC"}
        </button>
        <a href="/videos">Configurar videos locales</a>
        {conexion ? (
          <>
            <button
              type="button"
              className="boton-vidrio"
              disabled={ocupado}
              onClick={() => biblioteca()}
            >
              Vincular archivo local
            </button>
            <button
              type="button"
              className="boton-texto"
              disabled={ocupado}
              onClick={reindexar}
            >
              Actualizar carpeta
            </button>
          </>
        ) : null}
      </div>
      {estado ? (
        <p className="fila-sub">
          {estado.equipo.nombre} ·{" "}
          {estado.configurada
            ? `${estado.total} videos identificados`
            : "Carpeta pendiente de configurar"}
          {estado.escaneando
            ? ` · revisando ${estado.revisados} archivos…`
            : ""}
          {estado.error ? ` · ${estado.error}` : ""}
        </p>
      ) : null}
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
      {avisoGrabador ? <p className="ws-aviso">{avisoGrabador}</p> : null}
      {automatica ? (
        <>
          {automatica.resultado === "grabador_desconectado" ? <p className="ws-aviso">Inicia el grabador CATION VLM en esta PC y vuelve a comprobar.</p> : null}
          {automatica.resultado === "actualizacion_requerida" ? <p className="ws-aviso">Actualiza CATION VLM para consultar los clips por pedido y preparación.</p> : null}
          {automatica.resultado === "indexando" ? <p className="fila-sub" role="status">Identificando los clips de esta preparación. La consulta se actualizará al terminar.</p> : null}
          {automatica.resultado === "carpeta_incorrecta" ? <p className="ws-aviso">El grabador tiene clips para esta preparación, pero faltan en la carpeta configurada en CATION Videos. Selecciona la misma carpeta de grabaciones y actualízala.</p> : null}
          {automatica.resultado === "sin_operacion" ? <p className="fila-sub">El grabador de esta PC todavía no tiene registrada esta preparación del pedido.</p> : null}
          {automatica.resultado === "sin_video" ? <p className="fila-sub">La preparación está registrada, pero no tiene fragmentos de video guardados en el grabador.</p> : null}
          {automatica.faltantes || automatica.ausentes ? <p className="ws-aviso">La cobertura es parcial. Hay intervalos sin video o fragmentos ausentes en esta PC.</p> : null}
          {conexion ? [...new Set(automatica.clips.map(c => c.camara))].map(camara =>
            <ClipsPreparacionLocal key={camara + ":" + conexion.identidad.reto}
              clips={automatica.clips.filter(c => c.camara === camara)} conexion={conexion} />
          ) : null}
        </>
      ) : null}
      {!referencias.length && !automatica?.clips.length ? (
        <p className="ws-vacio">
          No hay videos locales vinculados a esta preparación.
        </p>
      ) : (
        referencias.map((v) => {
          const a = disponibles?.find((a) => a.clave === v.archivo_clave);
          return (
            <article className="ws-clip vl-clip" key={v.id}>
              <strong>{v.camara}</strong>
              <p>
                {v.archivo_nombre} · {tamanoVideo(v.bytes)}
              </p>
              <p className="fila-sub">
                {v.inicio && v.fin
                  ? `${fechaWholesale(v.inicio)} → ${fechaWholesale(v.fin)}`
                  : "Horario de grabación sin registrar"}
              </p>
              {disponibles === null ? (
                <p className="fila-sub">
                  Disponibilidad pendiente de comprobar en esta PC.
                </p>
              ) : !a ? (
                <p className="ws-aviso">No disponible en esta PC.</p>
              ) : conexion ? (
                <ReproductorLocal
                  key={`${v.id}:${conexion.identidad.reto}`}
                  video={v}
                  archivo={a}
                  conexion={conexion}
                />
              ) : null}
              <button
                type="button"
                className="boton-texto"
                disabled={ocupado}
                onClick={() => quitar(v.id)}
              >
                Quitar vínculo del expediente
              </button>
            </article>
          );
        })
      )}
      {elegir ? (
        <div className="vl-selector">
          <h4>Elegir video de la carpeta local</h4>
          <form
            className="vl-acciones"
            onSubmit={(e) => {
              e.preventDefault();
              void biblioteca();
            }}
          >
            <label>
              Nombre del archivo
              <input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                maxLength={120}
              />
            </label>
            <button className="boton-vidrio" disabled={ocupado}>
              Buscar
            </button>
          </form>
          <form className="vl-formulario" onSubmit={guardar}>
            <label>
              Archivo
              <select
                value={seleccion}
                onChange={(e) => setSeleccion(e.target.value)}
                required
              >
                <option value="">Seleccionar archivo…</option>
                {archivos.map((a) => (
                  <option key={a.clave} value={a.clave}>
                    {a.nombre} · {tamanoVideo(a.bytes)}
                  </option>
                ))}
              </select>
            </label>
            {!archivos.length ? (
              <p className="fila-sub">
                No hay archivos con esa búsqueda. Comprueba la carpeta o espera
                a que termine su lectura.
              </p>
            ) : null}
            <div className="vl-acciones">
              {pagina > 1 ? (
                <button
                  type="button"
                  className="boton-texto"
                  onClick={() => biblioteca(pagina - 1)}
                >
                  ← Anterior
                </button>
              ) : null}
              <span className="fila-sub">
                Página {pagina} · {total} archivos
              </span>
              {pagina * 50 < total ? (
                <button
                  type="button"
                  className="boton-texto"
                  onClick={() => biblioteca(pagina + 1)}
                >
                  Siguiente →
                </button>
              ) : null}
            </div>
            <label>
              Cámara
              <input
                name="camara"
                maxLength={160}
                placeholder="Ej.: Cámara de preparación"
                required
              />
            </label>
            <p className="fila-sub">
              Horario real de la grabación, si lo conoces. La fecha del archivo
              no se usa como hora de cámara.
            </p>
            <div className="vl-horarios">
              <label>
                Inicio · Bolivia
                <input type="datetime-local" name="inicio" />
              </label>
              <label>
                Fin · Bolivia
                <input type="datetime-local" name="fin" />
              </label>
            </div>
            <div className="vl-acciones">
              <button className="boton-vidrio" disabled={ocupado || !seleccion}>
                Guardar vínculo
              </button>
              <button
                className="boton-texto"
                type="button"
                onClick={() => setElegir(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {!conexion ? (
        <p className="fila-sub">
          <a href={PUENTE_LOCAL} target="_blank" rel="noreferrer">
            Abrir configuración de esta PC ↗
          </a>
        </p>
      ) : null}
    </section>
  );
}
