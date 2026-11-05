"use client";
import { useEffect, useRef, useState } from "react";
import { reproducirLocal, type ConexionLocal } from "@/lib/puente-videos-cliente";
import type { ClipPreparacionLocal } from "@/lib/videos-locales";

const fecha = (t: number) => new Date(t * 1000).toLocaleString("es-BO", {
  timeZone: "America/La_Paz", dateStyle: "short", timeStyle: "medium",
});

export function ClipsPreparacionLocal({ clips, conexion }: {
  clips: ClipPreparacionLocal[];
  conexion: ConexionLocal;
}) {
  const ordenados = [...clips].sort((a, b) => a.inicio - b.inicio || a.clave.localeCompare(b.clave));
  const [seleccion, setSeleccion] = useState(clips[0]?.inicio || 0);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const player = useRef<HTMLVideoElement>(null);
  const solicitud = useRef(0);
  const continuar = useRef(false);
  const posicion = useRef(0);
  const indice = Math.max(0, ordenados.findIndex(c => c.inicio === seleccion));
  const actual = ordenados[indice];
  useEffect(() => () => { solicitud.current++; }, []);

  async function abrir(index: number, automatico = false) {
    const clip = ordenados[index];
    if (!clip) return;
    const revision = ++solicitud.current;
    posicion.current = clip.inicio === seleccion ? player.current?.currentTime || 0 : 0;
    continuar.current = automatico;
    setSeleccion(clip.inicio);
    setCargando(true);
    setError("");
    setMensaje("");
    setUrl("");
    try {
      const resultado = await reproducirLocal(conexion, clip.clave);
      if (revision === solicitud.current) setUrl(resultado.url);
    } catch (e) {
      if (revision === solicitud.current) setError(e instanceof Error ? e.message : "No se pudo abrir el clip.");
    } finally {
      if (revision === solicitud.current) setCargando(false);
    }
  }
  if (!actual) return null;
  const canal = actual.camara.match(/-canal-(\d+)$/)?.[1];
  return <article className="ws-clip vl-clip">
    <strong>{canal ? "Cámara " + canal : actual.camara} · clips de esta preparación</strong>
    <p className="fila-sub">{fecha(ordenados[0].inicio)} → {fecha(ordenados.at(-1)!.fin)}</p>
    <label>Tramo de video
      <select value={actual.inicio} disabled={cargando} onChange={e => {
        void abrir(ordenados.findIndex(c => c.inicio === Number(e.target.value)));
      }}>
        {ordenados.map((c, i) => <option key={c.inicio} value={c.inicio}>
          Tramo {i + 1} · {fecha(c.inicio)} → {fecha(c.fin)}
        </option>)}
      </select>
    </label>
    {url ? <video ref={player} controls preload="metadata" crossOrigin="anonymous" src={url}
      aria-label={canal ? "Clips locales de cámara " + canal : "Clips de esta preparación"}
      onLoadedMetadata={() => {
        const video = player.current;
        if (!video) return;
        video.currentTime = posicion.current;
        if (continuar.current) void video.play().catch(() => {});
      }}
      onEnded={() => {
        const siguiente = ordenados[indice + 1];
        if (siguiente && siguiente.inicio <= actual.fin + 0.35) void abrir(indice + 1, true);
        else setMensaje(siguiente ? "Hay una pausa sin video. Pulsa Siguiente tramo para continuar." : "Fin del video disponible.");
      }}
      onError={() => setError("No se pudo reproducir este tramo. Renueva el enlace o vuelve a comprobar esta PC.")}
    /> : null}
    <div className="vl-acciones">
      <button className="boton-vidrio" type="button" disabled={cargando} onClick={() => void abrir(indice)}>
        {cargando ? "Abriendo…" : url ? "Renovar enlace local" : "Reproducir secuencia"}
      </button>
      <button className="boton-texto" type="button" disabled={cargando || indice === 0} onClick={() => void abrir(indice - 1)}>
        Tramo anterior
      </button>
      <button className="boton-texto" type="button" disabled={cargando || indice + 1 >= ordenados.length}
        onClick={() => void abrir(indice + 1)}>Siguiente tramo</button>
    </div>
    <p className="fila-sub">Tramo {indice + 1} de {ordenados.length}. La reproducción continúa entre fragmentos consecutivos.</p>
    {mensaje ? <p className="fila-sub" role="status">{mensaje}</p> : null}
    {error ? <p className="vl-error" role="alert">{error}</p> : null}
  </article>;
}
