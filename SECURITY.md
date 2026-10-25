# Security policy

## Supported versions

Security fixes are applied to the latest release on the `main` branch. Older
builds are not maintained.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately to the maintainer:

- GitHub: [@neshack](https://github.com/neshack) — use a private security
  advisory if the repository has them enabled.
- X/Twitter: [@neshack](https://x.com/neshack) — direct message.

Include:

- the version and platform,
- a minimal reproduction or proof of concept,
- the impact you believe it has,
- any suggested fix.

You will get an acknowledgement as soon as possible. Please give time for a fix
and a release before publishing details.

## Scope

The app is local-first and makes no network requests at runtime. The most
relevant areas are:

- parsing untrusted files (ZIP central directories, ID3/EXIF metadata),
- SQLite catalog files received from another machine,
- the Tauri IPC boundary and the commands exposed to the webview,
- installer and update artifacts.

Reports about a compromised machine, a malicious catalog the user deliberately
opened, or the lack of code signing on unsigned builds are in scope only when
they demonstrate a concrete impact beyond the documented design.
