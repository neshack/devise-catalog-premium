# Cómo contribuir

**Español** · [English](CONTRIBUTING.en.md)

Gracias por tomarte el tiempo de mejorar Devise Catalog Premium. Es una
aplicación de escritorio pequeña y local-first; las mejores contribuciones son
focales, probadas y fáciles de revisar.

## Antes de empezar

- Busca en los issues y pull requests existentes.
- Si vas a cambiar un comportamiento o agregar una dependencia, abre un issue
  primero para acordar el diseño antes de que exista código.
- Los problemas de seguridad van por [SECURITY.md](SECURITY.md), nunca por un
  issue público.

## Preparar el entorno

```bash
git clone https://github.com/neshack/devise-catalog-premium.git
cd devise-catalog-premium
npm ci
npm run tauri dev
```

Modo demostración, solo frontend:

```bash
npm run dev   # http://localhost:1420
```

Las dependencias de compilación en Linux están en el [README](README.md).

## Qué correr antes de abrir un PR

```bash
# Frontend
npx tsc --noEmit
npx vitest run
npm run build

# E2E (levanta Vite en :1420)
npx playwright test

# Rust
cd src-tauri
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Un pull request que cambia comportamiento sin una prueba está incompleto. Un
arreglo de bug debe incluir una prueba de regresión en el punto exacto donde
ocurrió el bug.

## Estilo de código

- TypeScript: modo estricto, sin `any` salvo que una frontera de terceros lo
  obligue.
- Rust: `rustfmt` y `clippy -D warnings` son el piso.
- Los comentarios explican **por qué**, no lo que hace la línea siguiente.
- La interfaz y la documentación de usuario van en español neutro; el código,
  los comentarios, los mensajes de commit y los identificadores van en inglés.
- Cada documento de usuario tiene su versión en inglés (`*.en.md`). Si cambias
  uno, actualiza el otro en el mismo pull request.
- Mantén el sistema de diseño en `src/index.css`; no introduzcas Tailwind ni una
  segunda librería de componentes.
- Sin llamadas de red en tiempo de ejecución, sin tipografías externas y sin
  CDNs. La aplicación debe funcionar sin conexión.

## Commits

Conventional Commits, una unidad de trabajo por commit:

```text
feat(tree): keep the selected file in place
fix(ipc): send Tauri arguments in camelCase
docs: explain the catalog migration
```

Sin atribución de IA ni trailers `Co-Authored-By`. Si un commit cambia
comportamiento, el cuerpo debe decir qué se verificó y cómo.

## Pull requests

- Mantén el diff focalizado; separa los cambios no relacionados.
- Describe el problema visible para el usuario y el arreglo elegido.
- Incluye capturas o una grabación corta para cambios de interfaz.
- Enumera los comandos que corriste y su resultado.
- Enlaza el issue que cierra el PR.

## Licencia

Al contribuir aceptas que tu contribución se publica bajo la
[Licencia MIT](LICENSE).
