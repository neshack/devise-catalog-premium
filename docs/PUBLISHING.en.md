# Publishing to GitHub

[Español](PUBLISHING.md) · **English**

The repository is prepared for a public `neshack/devise-catalog-premium`
repository. If your GitHub handle is different, update the URLs in
`package.json`, `src-tauri/Cargo.toml`, `README.md`, `README.en.md` and the
badges before pushing.

## 1. Create the repository

Create an empty **public** repository named `devise-catalog-premium` on GitHub.
Do not initialize it with a README, license or `.gitignore`: this history
already has them.

## 2. Push `main`

```bash
git remote add origin https://github.com/neshack/devise-catalog-premium.git
git push -u origin main
```

The default branch should be `main`. Tags are pushed one at a time, because each
`v*` tag starts a full three-OS release build:

```bash
git push origin v0.6.0
```

## 3. Protect the default branch

In **Settings → Branches**, protect `main` and require the `ci` checks before
merging. The workflow runs frontend, Rust, e2e and the FTS benchmark.

## 4. Signing secrets (optional)

The release workflow builds unsigned artifacts when the secrets are absent.
To sign Windows and macOS builds, run `scripts/wizard-signing.sh` and add the
resulting repository secrets in **Settings → Secrets and variables → Actions**:

| Group | Secrets |
|---|---|
| macOS signing | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_SIGNING_IDENTITY` |
| macOS notarization | `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` |
| Windows signing | `WINDOWS_CERTIFICATE`, `WINDOWS_CERTIFICATE_PASSWORD` |

Linux packages remain unsigned by design. A GPG-signed package repository is
future work.

## 5. Release

```bash
git tag v0.6.0
git push origin v0.6.0
```

The `release` workflow builds `.rpm`, `.deb`, `.AppImage`, `.msi`/`.exe` and
`.dmg` (Apple Silicon), verifies any configured signatures, and publishes a
GitHub Release with the artifacts attached.

## 6. Repository settings worth enabling

- **Security → Private vulnerability reporting** (matches `SECURITY.md`).
- **Discussions** (the issue template links to it).
- **Dependabot alerts** and **Dependabot security updates**.
- **Actions → General → Workflow permissions**: read-only by default; the
  release job asks for `contents: write` explicitly.

## Checklist before the first push

- [ ] `npx tsc --noEmit`
- [ ] `npx vitest run`
- [ ] `npx playwright test`
- [ ] `cargo fmt --all -- --check` (from `src-tauri/`)
- [ ] `cargo clippy --workspace --all-targets -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `npm audit` reports no production vulnerabilities
- [ ] `git status` is clean
- [ ] No `.env`, certificates or signing keys are tracked
- [ ] The version in the footer, the installer and the tag agree
- [ ] Every user-facing document that changed has its Spanish counterpart up to date
