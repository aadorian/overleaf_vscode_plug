<div align="center">

# LaTeX Overleaf Sync

**A VS Code extension for a complete LaTeX workflow with two-way Overleaf sync, an integrated PDF viewer, and SyncTeX.**

[![CI](https://github.com/<your-org>/latex-overleaf-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/<your-org>/latex-overleaf-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

</div>

---

## ✨ Features

- **Two-way Overleaf sync** over Git (`clone` / `pull` / `push`) — no reverse-engineered private APIs.
- **Secure auth** — the Overleaf Git token is stored in the OS keychain via `SecretStorage`, never in `settings.json`.
- **Local compilation** with `latexmk`/`pdflatex`, or automatic delegation to **LaTeX Workshop** when installed.
- **Integrated PDF viewer** in a VS Code `WebviewPanel`, auto-refreshed on recompile.
- **SyncTeX** — Forward Search (editor → PDF) and Inverse Search (PDF → editor).
- **Auto-sync** — optional background pull polling and debounced auto-push on save.
- **Sync status UI** — a sidebar tree view in the Explorer plus a status-bar indicator.

## 📦 Requirements

- VS Code `>= 1.85`
- Node.js `>= 18` (for building from source)
- A LaTeX distribution providing `latexmk` / `pdflatex` and the `synctex` CLI (TeX Live, MiKTeX…)
- An Overleaf project with the **Git** integration enabled

## 🚀 Getting started

### Install from source

```bash
git clone https://github.com/<your-org>/latex-overleaf-sync.git
cd latex-overleaf-sync
npm install
npm run compile
```

Press <kbd>F5</kbd> in VS Code to launch an **Extension Development Host**, or run
`npm run package` to produce a `.vsix` you can install via
*Extensions → … → Install from VSIX*.

### Connect a project

1. In Overleaf: **Menu → Git** and copy the repository URL
   (`https://git.overleaf.com/<PROJECT_ID>`).
2. In Overleaf: **Account → Settings → Git Integration** and generate a token.
3. In VS Code run **`LaTeX Overleaf: Connect Account`** and paste both when prompted.
   The project is cloned (or linked) into your workspace.

## 🕹️ Commands

| Command                                    | Default keybinding        | Description                              |
| ------------------------------------------ | ------------------------- | ---------------------------------------- |
| `LaTeX Overleaf: Connect Account`          | —                         | Store credentials and link the project   |
| `LaTeX Overleaf: Pull Latest Changes`      | —                         | Pull remote changes from Overleaf        |
| `LaTeX Overleaf: Push Changes`             | —                         | Commit & push local changes              |
| `LaTeX Overleaf: Open Webview PDF`         | —                         | Compile and open the integrated viewer   |
| `LaTeX Overleaf: Compile`                  | `Ctrl/Cmd+Alt+B`          | Compile the main `.tex`                   |
| `LaTeX Overleaf: SyncTeX Forward Search`   | `Ctrl/Cmd+Alt+J`          | Jump from cursor to the PDF location      |
| `LaTeX Overleaf: Refresh Sync Status`      | —                         | Re-fetch and refresh the status view      |

## ⚙️ Settings

| Setting                                     | Default      | Description                                             |
| ------------------------------------------- | ------------ | ------------------------------------------------------ |
| `latexOverleaf.overleafGitUrl`              | `""`         | Overleaf project Git URL                                |
| `latexOverleaf.mainTexFile`                 | `main.tex`   | Main `.tex` file (relative to workspace root)           |
| `latexOverleaf.compileOnSave`               | `true`       | Compile automatically on save                           |
| `latexOverleaf.latexCommand`                | `latexmk`    | Compiler CLI (`latexmk` or `pdflatex`)                  |
| `latexOverleaf.autoPushOnSave`              | `false`      | Debounced auto-push after saving                        |
| `latexOverleaf.autoPull`                    | `false`      | Background polling for remote changes                   |
| `latexOverleaf.autoPullIntervalSeconds`     | `60`         | Auto-pull interval                                      |
| `latexOverleaf.pushDebounceMs`              | `4000`       | Debounce window before auto-push                        |

## 🏗️ Architecture

```
src/
├── extension.ts     # Activation entry point; wires modules & commands
├── overleafSync.ts  # Git-over-HTTPS synchronization with Overleaf
├── autoSync.ts      # Background pull polling + debounced push scheduler
├── compiler.ts      # latexmk/pdflatex or LaTeX Workshop delegation
├── pdfViewer.ts     # PDF WebviewPanel + SyncTeX message bridge
├── synctex.ts       # Forward/inverse search via the synctex CLI
└── statusView.ts    # Explorer sidebar sync-status tree view
```

### Design decisions

- **Overleaf via Git.** Every Overleaf project is a Git remote, so sync is
  standard Git — far more robust than the internal WebSocket API (not public or
  stable). We use [`simple-git`](https://github.com/steveukx/git-js).
- **Compilation.** If [LaTeX Workshop](https://marketplace.visualstudio.com/items?itemName=James-Yu.latex-workshop)
  is installed we delegate to it (mature build + SyncTeX). Otherwise we invoke
  `latexmk`/`pdflatex` with `-synctex=1`.
- **"Real-time" sync.** The Overleaf Git bridge has no real-time push, so
  `autoSync` approximates it with interval pulls and debounced pushes.

## 🔒 Security

The Overleaf token is stored only in `vscode.SecretStorage` (OS keychain). It is
injected into the Git remote URL per operation and never written to
`settings.json` or committed.

## 🗺️ Roadmap

- Embed PDF.js in `media/pdfjs/` for full in-viewer SyncTeX highlighting.
- Merge-conflict resolution using the VS Code merge editor.
- Multi-project / multi-remote support per workspace folder.
- Automated test suite (`@vscode/test-electron`).

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) and
our [Code of Conduct](./CODE_OF_CONDUCT.md). See the
[changelog](./CHANGELOG.md) for release history.

## 📄 License

[MIT](./LICENSE) © LaTeX Overleaf Sync contributors
