/** Fondo noche con cuatro luces desenfocadas: lo que el vidrio deja ver. */
export function Escena({ children }: { children: React.ReactNode }) {
  return (
    <div className="escena">
      <div aria-hidden="true" className="luz luz-1" />
      <div aria-hidden="true" className="luz luz-2" />
      <div aria-hidden="true" className="luz luz-3" />
      <div aria-hidden="true" className="luz luz-4" />
      {children}
    </div>
  );
}
