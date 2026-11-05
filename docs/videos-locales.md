# Videos locales por PC

Implementación para el expediente WholeSale y la pantalla `/videos`. Los archivos se reproducen desde la carpeta de la PC que abre el Dashboard. No se implementó un servidor de videos accesible desde internet ni una copia de grabaciones a DB, Vercel o Storage.

## Instalación

En el Dashboard, **Videos locales → Descargar CATION Videos para Windows** entrega el servicio sin runtime. Extraer el ZIP, hacer doble clic en `Configurar.cmd`, elegir carpeta, iniciar el servicio y copiar su código en el Dashboard. Para PCs sin Node se puede entregar el paquete portátil Windows x64 con `runtime/node.exe` y su licencia. Requiere Node.js 22 o posterior. La configuración y el índice son por cuenta Windows en `%LOCALAPPDATA%\CationVideos`, fuera de la carpeta de instalación. No copiar `config.json` entre PCs.

Para una PC ya configurada, ejecutar `Iniciar.cmd`. Los lanzadores conservan visible cualquier error, comprueban Node con `--version` (compatible con Windows PowerShell 5) y esperan la respuesta del servicio antes de abrir el navegador. Si el arranque falla, muestran el registro `%LOCALAPPDATA%\CationVideos\inicio.error.log`. Una actualización reemplaza los archivos del programa sin modificar la configuración ni las grabaciones.

El inicio automático es opcional con `Instalar-inicio.ps1`: crea un acceso en Inicio de la cuenta actual y un lanzador oculto. No requiere abrir puertos o instalar un servicio como administrador. El script no cambia la política global de ejecución de PowerShell. La carpeta del programa debe conservarse.

El código tiene forma `id-equipo:clave`. Cada PC genera su identidad y una clave aleatoria de 256 bits; la configuración local se protege con ACL de la cuenta Windows y SYSTEM. El código se ingresa únicamente al vincular el equipo. No se guarda en localStorage; el navegador conserva solo la preferencia de consulta automática.

## Acceso y reproducción

La aplicación usa el servicio fijo `http://127.0.0.1:8767`. La primera conexión parte del botón del usuario. La consulta automática posterior solo se intenta si el navegador informa que el permiso local ya está concedido. Se usa CORS con el origen exacto del Dashboard y `targetAddressSpace: loopback`. No se depende de los antiguos preflights PNA. Chrome/Edge pueden pedir permiso de acceso al equipo local. Referencias: [Chrome LNA](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access), [MDN loopback](https://developer.mozilla.org/en-US/docs/Web/API/Request/targetAddressSpace).

El servicio nunca recibe el JWT, la contraseña del usuario ni claves de Supabase. Descubre su propia identidad y un reto aleatorio por inicio. Una RPC autorizada del Dashboard emite un permiso HMAC SHA-256 de 90 segundos para ese equipo, usuario, audiencia y reto. La clave del equipo vive en una tabla privada sin SELECT de clientes. Las RPC exigen `auth.uid()` y `dash_acceso()`; los wrappers públicos son SECURITY INVOKER. Las funciones privadas fijan `search_path` y no conceden acceso a anon. Los clientes no tienen permisos directos sobre las tablas nuevas.

El permiso limitado permite consultar nombres y solicitar un enlace de reproducción. El enlace usa un token local aleatorio de cinco minutos, vinculado al archivo. Cada petición valida existencia, pertenencia a la carpeta y versión del archivo. Se soportan GET, HEAD, byte ranges simples y seeks. La renovación del enlace conserva la posición cuando el navegador vuelve a cargar los metadatos. No hay transcodificación ni modificación de archivos.

El servicio escucha solo en loopback, valida Host para evitar DNS rebinding, restringe Origin y no sigue enlaces simbólicos al indexar. La página local de configuración está protegida por CSRF y no permite CORS al Dashboard. Ninguna API recibe rutas arbitrarias de archivos: solo huellas conocidas del índice. Las solicitudes JSON tienen límite de tamaño. Los tickets de reproducción se mantienen únicamente en memoria y tienen un límite de entradas.

## Referencias y disponibilidad

Para grabaciones de CATION VLM, `/v1/preparacion` consulta exclusivamente el
grabador de `127.0.0.1:8091` por ID de pedido y preparación. Solo ofrece clips
que el grabador asignó a esa tanda y que el índice encuentra dentro de la
carpeta autorizada. El Dashboard agrupa los tramos por cámara y continúa la
reproducción cuando son consecutivos. El servicio conserva los permisos
HMAC y no transmite sus tickets ni las credenciales al grabador. Los vínculos
manuales continúan disponibles para videos externos.

El primer escaneo calcula SHA-256 del contenido completo. El índice local cachea archivos sin cambios por ruta, tamaño, mtime, inode y device; la DB no recibe esas rutas. Un mismo contenido conserva su huella en distintas carpetas o con otro nombre. Se omiten archivos que cambian mientras se calcula la huella. El servicio comprueba sus metadatos otra vez antes de entregar bytes; un archivo modificado obliga a actualizar el índice.

`analitica.pedido_video_local` conserva preparación, huella, nombre, tamaño, cámara y horarios opcionales. La preparación debe pertenecer al pedido WholeSale. Los enlaces se pueden actualizar o desactivar sin alterar operaciones o borrar el archivo. El expediente indica por separado servicio desconectado, disponibilidad pendiente y archivo ausente en esta PC. La fecha de modificación no se interpreta como hora de cámara. Los horarios opcionales ingresados se interpretan en America/La_Paz, independientemente de la zona de la PC.

MP4/M4V, WebM y Ogg se ofrecen para reproducción, condicionada al codec del navegador. DAV, AVI, MKV y MOV se indexan y pueden descargarse localmente cuando requieren conversión. No se afirma que una extensión MP4 garantice un codec compatible.

## Paquetes y comprobación

`python scripts/empaquetar-videos.py` vuelve a generar `public/descargas/cation-videos.zip`. Solo se incluyen los archivos explícitos de `puente-videos`; nunca configuraciones, claves ni videos. `--runtime <node.exe> --licencia-runtime <LICENSE>` crea una entrega portátil independiente con la licencia correspondiente. El ZIP del Dashboard se regenera cuando cambia el servicio o un script.

`tests/videos-locales.test.cjs`: permisos HMAC, caducidad y equipo/reto, byte ranges, Host/Origin, exclusión de junctions, paths privados, archivo modificado y reconocimiento del mismo contenido en otra carpeta. Las pruebas de junctions en Windows deben ejecutarse con permisos del usuario real si el sandbox prohíbe crearlas. `tests/videos-locales-base.sql` valida RPC, firma PostgreSQL, asociaciones, ausencia de horarios inventados y permisos dentro de una transacción con ROLLBACK. Nunca se adjuntan videos ficticios a pedidos reales de forma persistente.

## Grabador pendiente

Modelo informado: **Dahua DHI-XVR5216AN-S2**. La recuperación de horas faltantes queda pendiente. Se necesitan acceso autorizado, credenciales, cámaras, retención, reloj y método de exportación comprobado. No se guardaron credenciales del grabador ni se intentó conectarlo. El servicio local no presenta como recuperado ningún video inexistente.
