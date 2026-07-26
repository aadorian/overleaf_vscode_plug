# Contributing to LaTeX Overleaf Sync

Thanks for your interest in improving this project! This document explains how to
set up your environment, the conventions we follow, and how to submit changes.

## Table of contents

- [Code of Conduct](#code-of-conduct)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Project layout](#project-layout)
- [Coding standards](#coding-standards)
- [Commit messages](#commit-messages)
- [Submitting a pull request](#submitting-a-pull-request)
- [Reporting bugs & requesting features](#reporting-bugs--requesting-features)

## Code of Conduct

This project adheres to a [Code of Conduct](./CODE_OF_CONDUCT.md). By
participating you are expected to uphold it. Please report unacceptable behavior
via a private issue or to the maintainers.

## Getting started

Prerequisites:

- **Node.js** >= 18
- **VS Code** >= 1.85
- A LaTeX distribution (`latexmk` / `pdflatex`) available on your `PATH` if you
  want to test compilation.

```bash
git clone https://github.com/<your-org>/latex-overleaf-sync.git
cd latex-overleaf-sync
npm install
npm run compile     # or `npm run watch` for incremental builds
```

Press <kbd>F5</kbd> in VS Code to launch an **Extension Development Host** with
the extension loaded.

## Development workflow

| Task               | Command           |
| ------------------ | ----------------- |
| Type-check + build | `npm run compile` |
| Watch mode         | `npm run watch`   |
| Lint               | `npm run lint`    |
| Format             | `npm run format`  |
| Package `.vsix`    | `npm run package` |

CI runs lint + build on every pull request. Please make sure `npm run lint` and
`npm run compile` pass locally before pushing.

## Project layout

```
src/
├── extension.ts     # Activation entry point; wires modules & commands
├── overleafSync.ts  # Git-over-HTTPS synchronization with Overleaf
├── compiler.ts      # latexmk/pdflatex or LaTeX Workshop delegation
├── pdfViewer.ts     # PDF WebviewPanel + SyncTeX hooks
├── synctex.ts       # SyncTeX forward/inverse search helpers
└── statusView.ts    # Explorer sidebar sync-status tree view
```

Keep domain logic inside its module; `extension.ts` should only wire things
together.

## Coding standards

- **TypeScript strict mode** is enabled — no `any` unless justified with a
  comment.
- Prefer small, single-responsibility modules.
- Public methods should have a short doc comment explaining intent, especially
  where VS Code API quirks are involved.
- Run Prettier + ESLint before committing.

## Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add auto-sync polling with debounce
fix: handle missing synctex.gz gracefully
docs: expand README setup section
chore: bump simple-git to 3.23
```

## Submitting a pull request

1. Fork and create a topic branch: `git checkout -b feat/my-feature`.
2. Make your changes with tests/docs as appropriate.
3. Ensure `npm run lint && npm run compile` pass.
4. Open a PR against `main` using the PR template. Describe the motivation and
   any user-facing changes.

## Reporting bugs & requesting features

Use the issue templates under **New Issue**. Include VS Code version, OS, LaTeX
distribution, and reproduction steps for bugs.
