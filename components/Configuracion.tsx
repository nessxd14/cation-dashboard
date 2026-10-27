"use client";

import { useActionState } from "react";
import {
  guardarCosto,
  guardarMeta,
  type EstadoConfiguracion,
} from "@/app/(dash)/configurar";
const inicial: EstadoConfiguracion = { error: null, ok: false };
function Mensaje({ estado }: { estado: EstadoConfiguracion }) {
  return estado.error ? (
    <p role="alert" className="error">
      {estado.error}
    </p>
  ) : estado.ok ? (
    <p role="status" className="exito">
      Guardado.
    </p>
  ) : null;
}
export function FormMeta({
  mes,
  sucursal,
  ventas,
  cobranza,
}: {
  mes: string;
  sucursal: string;
  ventas?: number;
  cobranza?: number;
}) {
  const [estado, accion, pendiente] = useActionState(guardarMeta, inicial);
  return (
    <form action={accion} className="configuracion">
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="sucursal" value={sucursal} />
      <label className="campo">
        Objetivo de ventas (Bs)
        <input
          type="number"
          name="ventas"
          required
          min="0"
          max="1000000000000"
          step="0.01"
          defaultValue={ventas}
          placeholder="Sin definir"
        />
      </label>
      <label className="campo">
        Objetivo de cobranza (Bs)
        <input
          type="number"
          name="cobranza"
          required
          min="0"
          max="1000000000000"
          step="0.01"
          defaultValue={cobranza}
          placeholder="Sin definir"
        />
      </label>
      <button className="boton-vidrio" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar metas"}
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}
export function FormCosto({
  productos,
  seleccionado,
  desde,
}: {
  productos: { id: string; nombre: string }[];
  seleccionado?: string;
  desde: string;
}) {
  const [estado, accion, pendiente] = useActionState(guardarCosto, inicial);
  return (
    <form action={accion} className="configuracion">
      <label className="campo">
        Producto y unidad base
        <select name="producto" defaultValue={seleccionado ?? ""} required>
          <option value="" disabled>
            Seleccionar producto
          </option>
          {productos.map((p) => (
            <option value={p.id} key={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="campo">
        Costo por una unidad base (Bs)
        <input
          name="costo"
          type="number"
          required
          min="0.000001"
          max="1000000000000"
          step="any"
          placeholder="Ej.: una hoja, no el paquete"
        />
      </label>
      <label className="campo">
        Vigente desde
        <input
          name="desde"
          type="date"
          required
          min="2000-01-01"
          max="2100-12-31"
          defaultValue={desde}
        />
      </label>
      <label className="campo">
        Fuente o nota
        <input
          name="nota"
          maxLength={500}
          placeholder="Factura o referencia del costo"
        />
      </label>
      <button className="boton-vidrio" disabled={pendiente}>
        {pendiente ? "Guardando…" : "Guardar costo de referencia"}
      </button>
      <Mensaje estado={estado} />
    </form>
  );
}
