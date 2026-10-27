import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Escena } from "@/components/Escena";
import { Menu } from "@/components/Menu";
import { AvisoPantalla } from "@/components/AvisoPantalla";
import { ErrorDatos, obtenerSalud, tieneAcceso, usuarioActual } from "@/lib/datos";
import { horaLaPaz } from "@/lib/formato";

export const dynamic = "force-dynamic";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/login");

  const liviano = (await cookies()).get("lite")?.value === "1";

  let alertas = 0;
  try {
    if (!(await tieneAcceso())) {
      return (
        <Escena>
          <AvisoPantalla
            titulo="Sin acceso"
            texto="Este dashboard es solo para Ness y el gerente. Si necesitas entrar, pide que agreguen tu cuenta a analitica.acceso."
            conSalir
          />
        </Escena>
      );
    }
    alertas = (await obtenerSalud()).filter((i) => i.nivel !== "ok").length;
  } catch (e) {
    if (e instanceof ErrorDatos) {
      return (
        <Escena>
          <AvisoPantalla titulo="No se pudo cargar el dashboard" texto={e.message} conSalir />
        </Escena>
      );
    }
    throw e;
  }

  return (
    <Escena>
      <div className="marco">
        <Menu correo={usuario.email ?? ""} alertas={alertas} hora={horaLaPaz()} liviano={liviano} />
        <main className="contenido">{children}</main>
      </div>
    </Escena>
  );
}
