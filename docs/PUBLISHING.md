# Publicar en GitHub

**Español** · [English](PUBLISHING.en.md)

El repositorio está preparado para ser público en `neshack/devise-catalog-premium`.
Si tu usuario de GitHub es distinto, actualiza las URLs en `package.json`,
`src-tauri/Cargo.toml`, `README.md`, `README.en.md` y los badges antes de hacer
push.

## 1. Crear el repositorio

Crea un repositorio **público** vacío llamado `devise-catalog-premium` en
GitHub. No lo inicialices con README, licencia ni `.gitignore`: este historial ya
los tiene.

## 2. Subir `main`

```bash
git remote add origin https://github.com/neshack/devise-catalog-premium.git
git push -u origin main
```

La rama por defecto debe ser `main`. Los tags se suben de uno en uno, porque
cada tag `v*` inicia una compilación completa para los tres sistemas:

```bash
git push origin v0.6.0
```

## 3. Proteger la rama por defecto

En **Settings → Branches**, protege `main` y exige los checks de `ci` antes de
fusionar. El workflow corre frontend, Rust, e2e y el benchmark de FTS.

## 4. Secretos de firma (opcional)

El workflow de release genera artefactos sin firma cuando los secretos no
existen. Para firmar las compilaciones de Windows y macOS, corre
`scripts/wizard-signing.sh` y agrega los secretos resultantes en
**Settings → Secrets and variables → Actions**:

| Grupo | Secretos |
|---|---|
| Firma de macOS | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_SIGNING_IDENTITY` |
| Notarización de macOS | `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` |
| Firma de Windows | `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` |

Los paquetes de Linux siguen sin firma a propósito. Un repositorio de paquetes
Linux firmado con GPG es trabajo futuro.

## 5. Publicar una versión

```bash
git tag v0.6.0
git push origin v0.6.0
```

El workflow `release` compila `.rpm`, `.deb`, `.AppImage`, `.msi`/`.exe` y
`.dmg` (Apple Silicon), verifica las firmas configuradas y publica un Release de
GitHub con los artefactos adjuntos.

## 6. Configuración del repositorio que conviene activar

- **Security → Private vulnerability reporting** (coincide con `SECURITY.md`).
- **Discussions** (la plantilla de issues enlaza ahí).
- **Dependabot alerts** y **Dependabot security updates**.
- **Actions → General → Workflow permissions**: solo lectura por defecto; el job
  de release pide `contents: write` de forma explícita.

## Lista de verificación antes del primer push

- [ ] `npx tsc --noEmit`
- [ ] `npx vitest run`
- [ ] `npx playwright test`
- [ ] `cargo fmt --all -- --check` (desde `src-tauri/`)
- [ ] `cargo clippy --workspace --all-targets -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `npm audit` no reporta vulnerabilidades de producción
- [ ] `git status` está limpio
- [ ] No hay `.env`, certificados ni llaves de firma versionados
- [ ] La versión del pie de página, la del instalador y la del tag coinciden
- [ ] Cada documento de usuario que cambió tiene su versión en inglés al día
