import { salir } from "@/app/login/actions";

export function AvisoPantalla({
  titulo,
  texto,
  conSalir = false,
}: {
  titulo: string;
  texto: string;
  conSalir?: boolean;
}) {
  return (
    <main className="login">
      <section className="vidrio vacio" style={{ maxWidth: 560 }}>
        <h1>{titulo}</h1>
        <p>{texto}</p>
        {conSalir ? (
          <form action={salir}>
            <button type="submit" className="boton-vidrio">
              Salir
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
