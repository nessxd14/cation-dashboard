"use client";

export default function ErrorDash({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <section className="vidrio vacio">
      <h1>No se pudieron cargar los datos</h1>
      <p>{error.message || "Error inesperado."}</p>
      <div>
        <button type="button" className="boton-vidrio" onClick={reset}>
          Reintentar
        </button>
      </div>
    </section>
  );
}
