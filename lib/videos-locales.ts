export const PUENTE_LOCAL = "http://127.0.0.1:8767";
export const PREFERENCIA_VIDEO_LOCAL = "cation-videos-locales-v1";
export const esEquipoVideo = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export const esClaveVideo = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
export type VideoLocal = {
  id: string;
  preparacion_id: string;
  archivo_clave: string;
  archivo_nombre: string;
  bytes: number;
  camara: string;
  inicio: string | null;
  fin: string | null;
};
export type ArchivoLocal = {
  clave: string;
  nombre: string;
  bytes: number;
  modificado_en: string;
  tipo: string;
  reproducible: boolean;
};
export type ClipPreparacionLocal = ArchivoLocal & {
  camara: string;
  inicio: number;
  fin: number;
};
export type PreparacionLocal = EstadoPuente & {
  resultado: "encontrada" | "sin_operacion" | "grabador_desconectado" | "actualizacion_requerida" |
    "indexando" | "carpeta_incorrecta" | "sin_video";
  clips: ClipPreparacionLocal[];
  faltantes?: number;
  ausentes?: number;
};
export type IdentidadPuente = {
  id: string;
  nombre: string;
  reto: string;
  version: number;
};
export type EstadoPuente = {
  equipo: { id: string; nombre: string };
  configurada: boolean;
  escaneando: boolean;
  revisados: number;
  indexados: number;
  total: number;
  error: string | null;
};
export function codigoEquipoVideo(
  codigo: unknown,
): { id: string; clave: string } | null {
  if (typeof codigo !== "string" || codigo.length > 120) return null;
  const [id, clave, ...resto] = codigo.trim().split(":");
  return !resto.length && esEquipoVideo(id) && esClaveVideo(clave)
    ? { id, clave }
    : null;
}
export function fechaGrabacionBolivia(valor: unknown): string | null {
  if (
    typeof valor !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)
  )
    return null;
  const d = new Date(`${valor}:00-04:00`);
  if (!Number.isFinite(d.getTime())) return null;
  return new Date(d.getTime() - 14400000).toISOString().slice(0, 16) === valor
    ? d.toISOString()
    : null;
}
export function tamanoVideo(bytes: number): string {
  return bytes >= 1073741824
    ? `${(bytes / 1073741824).toFixed(1)} GB`
    : `${Math.max(0.1, bytes / 1048576).toFixed(1)} MB`;
}
