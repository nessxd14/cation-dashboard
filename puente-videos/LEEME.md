# CATION Videos · servicio por PC

1. Extrae el ZIP en una carpeta estable de la PC.
2. Haz clic derecho en **Configurar.ps1 → Ejecutar con PowerShell**. Elige la carpeta que contiene los videos. Puede ser distinta en cada PC.
3. Se abre `http://127.0.0.1:8767`. Copia su código de vinculación.
4. En el Dashboard abre **Videos locales**, pega el código y pulsa **Vincular esta PC**. Acepta el acceso local cuando lo solicite el navegador.
5. En **Pedidos**, abre el expediente, una preparación y la etapa **Alistado** o **Verificación**. Pulsa **Comprobar en esta PC → Vincular archivo local**.

Requiere Node.js 22 o posterior, salvo que uses el paquete portátil que incluye `runtime/node.exe`. El ZIP descargado desde el Dashboard contiene el servicio y los scripts; no instala Node automáticamente. Usa Chrome o Edge actualizados en Windows.

Los archivos originales se leen y permanecen en su carpeta. No se suben videos a la DB, a Vercel ni a Storage. En la base se guarda el vínculo con el pedido y la huella SHA-256 del contenido. La carpeta, el índice y la clave del servicio se conservan solo en `%LOCALAPPDATA%\CationVideos` de esta PC. No copies `config.json` entre equipos: cada uno necesita su propia identidad. Puedes copiar los mismos videos a otras rutas y volver a indexarlos; se reconocerán por su contenido.

La primera lectura calcula las huellas completas y puede tardar con grabaciones grandes. Los archivos ya identificados están disponibles mientras continúa la lectura. Las siguientes reutilizan el índice de archivos sin cambios. No se siguen enlaces simbólicos. Los archivos que siguen grabándose se omiten si cambian durante el cálculo; vuelve a actualizar cuando termine su escritura.

**Iniciar.ps1** inicia el servicio y abre su configuración. **Instalar-inicio.ps1** agrega un acceso al inicio de Windows para la cuenta actual; es opcional y requiere conservar la carpeta del programa. La carpeta de grabaciones se puede cambiar desde la configuración local. Primero espera a que termine una indexación en curso.

Si Windows bloquea los scripts descargados, abre las propiedades del ZIP original, marca **Desbloquear**, vuelve a extraerlo y ejecuta el script. No cambies globalmente las políticas de seguridad de PowerShell. Si tu organización restringe scripts, solicita que el administrador permita este paquete.

El puerto 8767 escucha únicamente en `127.0.0.1`. No abras puertos del router ni del firewall para usarlo. El Dashboard autoriza la lectura con un permiso temporal específico para este equipo; el servicio no recibe contraseñas ni tokens de sesión de Supabase. La configuración de carpeta se realiza en la página local, con protección contra solicitudes de otros sitios.

Los enlaces de reproducción caducan a los cinco minutos; usa **Renovar enlace local** si necesitas volver a solicitarlo. El equipo y el navegador deben tener la hora correcta. Un archivo ausente aparece como **No disponible en esta PC**. Un servicio detenido o un permiso del navegador denegado se presenta como problema de conexión y no como ausencia del archivo.

MP4/H.264 y WebM son los formatos habituales de reproducción. DAV, AVI, MKV y MOV se pueden identificar y vincular, pero se ofrecen como descarga local si necesitan conversión. No se convierten archivos ni se modifica el original. La fecha de modificación no se interpreta como hora de grabación. El inicio y fin de grabación son opcionales y deben indicar horas reales de Bolivia; no se calculan a partir de la ventana solicitada de la preparación.

**NVR pendiente:** Dahua **DHI-XVR5216AN-S2**. Falta conocer el acceso, las credenciales, cámaras, reloj y método de exportación. Este servicio no se conecta al grabador ni recupera horas faltantes.
