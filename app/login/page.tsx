"use client";

import { useActionState } from "react";
import { Escena } from "@/components/Escena";
import { ingresar, type EstadoLogin } from "./actions";

const inicial: EstadoLogin = { error: null };

export default function LoginPage() {
  const [estado, accion, enviando] = useActionState(ingresar, inicial);

  return (
    <Escena>
      <main className="login">
        <form action={accion} className="vidrio login-tarjeta" aria-describedby="login-ayuda">
          <div className="marca" style={{ padding: 0 }}>
            <div aria-hidden="true" className="marca-logo" />
            <div>
              <div className="marca-nombre">CATION</div>
              <div className="marca-sub">Dashboard de operaciones</div>
            </div>
          </div>
          <h1>Ingresar</h1>
          <p id="login-ayuda" className="subtitulo" style={{ margin: 0 }}>
            Con la misma cuenta del Seller. Solo Ness y el gerente tienen acceso.
          </p>
          <label className="campo">
            Correo
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="campo">
            Contraseña
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {estado.error ? (
            <div role="alert" className="error">
              {estado.error}
            </div>
          ) : null}
          <button type="submit" className="boton-vidrio" disabled={enviando}>
            {enviando ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </main>
    </Escena>
  );
}
