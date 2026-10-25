# Contributing

Thanks for taking the time to improve Devise Catalog Premium. This is a small,
local-first desktop app; the best contributions are focused, tested and easy to
review.

## Before you start

- Search the existing issues and pull requests.
- For a behavior change or a new dependency, open an issue first so the design
  can be agreed before code exists.
- Security problems go through [SECURITY.md](SECURITY.md), never a public issue.

## Development setup

```bash
git clone https://github.com/neshack/devise-catalog-premium.git
cd devise-catalog-premium
npm ci
npm run tauri dev
```

Frontend-only demo mode:

```bash
npm run dev   # http://localhost:1420
```

Linux build dependencies are listed in the [README](README.md).

## What to run before opening a PR

```bash
# Frontend
npx tsc --noEmit
npx vitest run
npm run build

# E2E (starts Vite on :1420)
npx playwright test

# Rust
cd src-tauri
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

A pull request that changes behavior without a test is incomplete. A bug fix
should include a regression test at the seam where the bug actually happened.

## Code style

- TypeScript: strict mode, no `any` unless a third-party boundary forces it.
- Rust: `rustfmt` and `clippy -D warnings` are the floor.
- Comments explain **why**, not what the next line does.
- UI copy is Spanish (Mexico-neutral). Code, comments, commit messages, docs and
  identifiers are English.
- Keep the design system in `src/index.css`; do not introduce Tailwind or a
  second component library.
- No runtime network calls, external fonts or CDNs. The app must work offline.

## Commits

Conventional Commits, one work unit per commit:

```text
feat(tree): keep the selected file in place
fix(ipc): send Tauri arguments in camelCase
docs: explain the catalog migration
```

No AI attribution or `Co-Authored-By` trailers. If a commit changes behavior,
the body should say what was verified and how.

## Pull requests

- Keep the diff focused; split unrelated changes.
- Describe the user-visible problem and the chosen fix.
- Include screenshots or a short recording for UI changes.
- List the commands you ran and their result.
- Link the issue the PR closes.

## License

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE).
