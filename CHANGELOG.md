# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Auto-sync: optional background polling that pulls from Overleaf on an
  interval, with debounced auto-push on save.
- SyncTeX **Forward Search** command: jump from the `.tex` cursor to the
  matching location in the PDF viewer.
- SyncTeX inverse-search scaffolding in the webview.
- Open-source project scaffolding: `LICENSE`, `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, issue/PR templates, GitHub Actions CI, ESLint +
  Prettier + EditorConfig.

## [0.0.1] - 2026-07-26

### Added

- Initial extension scaffold.
- Overleaf synchronization over Git (clone / pull / push) using `simple-git`,
  with the auth token stored in `SecretStorage`.
- Local LaTeX compilation via `latexmk`/`pdflatex`, or delegation to LaTeX
  Workshop when installed.
- Integrated PDF viewer using a `WebviewPanel`.
- Explorer sidebar showing sync status, plus a status-bar indicator.
- Commands: Connect Account, Pull, Push, Open Webview PDF, Refresh Status.

[Unreleased]: https://github.com/<your-org>/latex-overleaf-sync/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/<your-org>/latex-overleaf-sync/releases/tag/v0.0.1
