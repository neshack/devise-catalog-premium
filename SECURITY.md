# Política de seguridad

**Español** · [English](SECURITY.en.md)

## Versiones soportadas

Los arreglos de seguridad se aplican a la última versión publicada en la rama
`main`. Las compilaciones anteriores no reciben mantenimiento.

## Reportar una vulnerabilidad

**No abras un issue público.** Repórtala en privado a quien mantiene el
proyecto:

- GitHub: [@neshack](https://github.com/neshack) — usa un aviso de seguridad
  privado si el repositorio los tiene habilitados.
- X/Twitter: [@neshack](https://x.com/neshack) — mensaje directo.

Incluye:

- la versión y la plataforma,
- una reproducción mínima o una prueba de concepto,
- el impacto que crees que tiene,
- cualquier arreglo que sugieras.

Recibirás un acuse de recibo lo antes posible. Por favor, da tiempo para un
arreglo y una versión nueva antes de publicar detalles.

## Alcance

La aplicación es local-first y no hace peticiones de red en tiempo de ejecución.
Las áreas más relevantes son:

- el análisis de archivos no confiables (directorios centrales de ZIP,
  metadatos ID3/EXIF),
- archivos de catálogo SQLite recibidos de otra máquina,
- la frontera IPC de Tauri y los comandos expuestos a la webview,
- los instaladores y los artefactos de actualización.

Los reportes sobre una máquina comprometida, un catálogo malicioso que el
usuario abrió a propósito o la falta de firma en compilaciones sin firmar están
en alcance solo cuando demuestran un impacto concreto más allá del diseño
documentado.
