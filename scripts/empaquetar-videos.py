"""Paquete reproducible del servicio, sin configuración ni archivos del usuario."""
import argparse
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--destino', type=Path, default=root / 'public' / 'descargas' / 'cation-videos.zip')
parser.add_argument('--runtime', type=Path)
parser.add_argument('--licencia-runtime', type=Path)
args = parser.parse_args()
if args.runtime and (not args.licencia_runtime or not args.licencia_runtime.is_file()):
    parser.error('El runtime portátil requiere su licencia de redistribución.')
files = ['servidor.mjs', 'Configurar.cmd', 'Configurar.ps1', 'Iniciar.cmd', 'Iniciar.ps1', 'Actualizar.cmd', 'Instalar-inicio.ps1', 'LEEME.md']
args.destino.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(args.destino, 'w', ZIP_DEFLATED, compresslevel=9) as archive:
    for name in files:
        content = (root / 'puente-videos' / name).read_bytes()
        if name.endswith('.ps1'):
            content = b'\xef\xbb\xbf' + content.removeprefix(b'\xef\xbb\xbf')
        if name.endswith('.cmd'):
            content = content.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        archive.writestr(name, content)
    if args.runtime:
        archive.write(args.runtime, 'runtime/node.exe')
        archive.write(args.licencia_runtime, 'runtime/LICENSE.txt')
print(args.destino)
