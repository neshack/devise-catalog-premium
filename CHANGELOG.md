# Registro de cambios

**Español** · [English](CHANGELOG.en.md)

Todos los cambios notables de este proyecto se documentan aquí. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[Versionado Semántico](https://semver.org/lang/es/).

## [0.6.0] — 2026-10-29

### Agregado

- **Cada volumen dice qué tipo de dispositivo es y qué colores lo identifican.**
  El diálogo de identidad ofrece ocho placas incluidas (óptico, USB, externo,
  SD, interno, NAS, imagen montada y cifrado) y uno o dos colores de indicador,
  guardados con el volumen y dibujados en la barra lateral como un LED de dos
  tonos. Las placas no llevan color; la paleta es dato, así que la misma placa
  sirve para cualquier elección.

## [0.5.0] — 2026-10-29

### Agregado

- **Elegir la unidad con el diálogo del sistema.** El diálogo de escaneo abre el
  selector nativo de carpetas y toma de ahí la ruta absoluta; la etiqueta se
  sugiere a partir de la carpeta elegida. Escribir la ruta a mano sigue
  funcionando.
- **Los volúmenes se pueden identificar sin su disco.** Cada volumen acepta una
  descripción y una imagen de catálogo. La imagen se reduce, se incrusta en el
  catálogo como data URL y se muestra en la barra lateral, así que el archivo
  original puede moverse o desaparecer.
- **El panel izquierdo se colapsa a una barra de íconos**, con portadas,
  monogramas, tooltips y nombres accesibles; la preferencia sobrevive al
  reinicio.
- **Las exportaciones siguen al volumen seleccionado.** El menú nombra el
  volumen, el archivo toma su nombre y CSV/JSON ahora incluyen la ubicación
  completa de cada archivo.
- **La exportación HTML es una página de esta aplicación**: la marca del disco,
  la paleta de grafito y ámbar, la portada y la descripción del volumen,
  estadísticas y un filtro sin conexión sobre la tabla. Las páginas se limitan a
  25 000 filas y lo dicen; CSV y JSON siguen completos.

### Corregido

- Un escaneo terminado ya no deja el diálogo atascado en su resumen: abrir
  **Escanear volumen** de nuevo inicia un escaneo nuevo.
- El final de un escaneo dice si terminó, se canceló o se interrumpió, en lugar
  de reportar todos los resultados como éxito.
- Una ruta larga en el progreso del escaneo se ajusta dentro del diálogo en
  lugar de salirse del borde.
- Los diálogos más altos que la ventana desplazan su cuerpo; sus botones siguen
  accesibles.

## [0.4.0] — 2026-10-25

### Agregado

- Etiquetas en archivos y carpetas. Las etiquetas de carpeta se heredan en su
  subárbol al buscar. Sintaxis de búsqueda: `tag:playa` o `#playa`.
- Menú contextual de resultados con **Ubicar en el árbol**, que abre todas las
  carpetas superiores al archivo y lo deja seleccionado.
- Rutas completas en el inspector y en la lista de duplicados, ajustadas en
  lugar de truncadas.

### Corregido

- La eliminación de volúmenes corre fuera del hilo principal, así que una
  cascada grande ya no congela la ventana. El diálogo permanece abierto si la
  eliminación falla.
- `files(volume_id)` tiene índice: la misma cascada de 100k archivos bajó de
  ~3.6 s a ~1.0 s en la máquina de desarrollo.
- Buscar desde el árbol abre la pantalla de resultados; seleccionar un volumen
  sin consulta abre el árbol en lugar de una lista de resultados vacía.
- Una búsqueda pendiente ya no puede llevar al usuario de vuelta a resultados
  mientras "Ubicar en el árbol" está abriendo el árbol.

## [0.3.0] — 2026-10-25

### Cambiado

- El producto se renombró a **Devise Catalog Premium**.
- Nuevo identificador de paquete `com.devise.catalog`; el `catalog.cdc` anterior
  se copia desde `com.cdcatalog.premium` en el primer arranque.
- El árbol es la vista principal; seleccionar un archivo actualiza el inspector
  sin salir del árbol.
- La selección de volumen se identifica por `(label, serial)`, así que dos
  discos con la misma etiqueta ya no se seleccionan juntos.
- El título nativo de la ventana y la cabecera incluyen la versión en ejecución.

### Agregado

- Eliminación segura de volúmenes: hay que escribir la etiqueta del volumen; el
  disco nunca se modifica.
- Temas claro, oscuro y del sistema, elegidos desde la cabecera, aplicados antes
  del primer pintado y recordados entre arranques.
- Pantalla de bienvenida con la marca, la versión y el perfil del autor
  ([@neshack](https://x.com/neshack)).
- El script de post-instalación de Linux refresca las cachés de íconos y del
  escritorio, y el paquete incluye un ícono de 512 px.

### Corregido

- Los argumentos IPC de Tauri v2 se envían en camelCase. Seleccionar un archivo
  del árbol ya no falla con `missing required key fileId`; las consultas de
  duplicados y las exportaciones usan la misma normalización.
- `formatBytes` usa separadores en español en lugar de `toFixed`.

## [0.2.0] — 2026-10-18

### Agregado

- Los intentos de escaneo se guardan en `scan_runs` con un latido, barrido al
  inicio y reanudación manual tras un cierre o suspensión.
- Barra de escaneo con fase, ruta actual, archivos vistos, porcentaje, ETA,
  velocidad y conteo de rutas ilegibles; pausar, reanudar y cancelar.
- Árbol de volúmenes con un nivel por consulta y conteos directos por carpeta.
- Marca de la aplicación, favicon y el conjunto completo de íconos del sistema
  operativo.

### Cambiado

- La versión tiene una sola fuente: `package.json` (Tauri la lee, Vite la
  inyecta).
- La barra de estado muestra la versión en ejecución.

## [0.1.0] — 2026-09-05

### Agregado

- Primer MVP: escaneo diferencial de volúmenes, búsqueda SQLite FTS5, detección
  de duplicados, inspector, entradas de ZIP, exportaciones y modo demostración.
