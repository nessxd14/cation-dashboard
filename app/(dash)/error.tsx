"use client";

import { ErrorConsulta } from "@/components/ErrorConsulta";

export default function ErrorDash({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorConsulta
      mensaje="Ocurrió un problema al consultar el Dashboard. Vuelve a intentarlo."
      referencia={error.digest}
      reintentar={reset}
    />
  );
}
