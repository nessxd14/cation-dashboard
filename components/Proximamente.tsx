export function Proximamente({ titulo, fase, puntos }: { titulo: string; fase: string; puntos: string[] }) {
  return (
    <>
      <header className="encabezado">
        <div>
          <h1>{titulo}</h1>
          <div className="subtitulo">{fase}</div>
        </div>
      </header>
      <section className="vidrio panel">
        <h2>Lo que va a mostrar</h2>
        <div>
          {puntos.map((p) => (
            <div key={p} className="fila">
              <span className="fila-nombre">{p}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
