# LaTeX Overleaf Sync

Extensión de VS Code que integra un entorno LaTeX completo con sincronización
bidireccional con Overleaf.

## Arquitectura

```
overleafPlug/
├── package.json            # Manifiesto: commands, views, configuration, deps
├── tsconfig.json
├── .vscode/                # launch.json + tasks.json (F5 para depurar)
├── src/
│   ├── extension.ts        # Punto de entrada: activa y cablea todo
│   ├── overleafSync.ts     # Sincronización Git-over-HTTPS con Overleaf
│   ├── compiler.ts         # Compilación latexmk/pdflatex o LaTeX Workshop
│   ├── pdfViewer.ts        # Visor PDF en WebviewPanel (+ ganchos SyncTeX)
│   └── statusView.ts       # Vista lateral de estado en el Explorer
└── out/                    # JS compilado (generado)
```

### Decisiones clave

- **Overleaf vía Git.** Cada proyecto Overleaf es un repo Git
  (`https://git.overleaf.com/<ID>`). Usamos `simple-git`, no la API interna
  (no pública ni estable). El token va en `SecretStorage`, nunca en settings.
- **Compilación.** Si está instalada **LaTeX Workshop**, se delega en ella
  (`latex-workshop.build`, SyncTeX incluido). Si no, se usa `latexmk`/`pdflatex`
  del `PATH` con `-synctex=1`.
- **Visor PDF.** `WebviewPanel` con `<iframe>` al PDF vía `asWebviewUri`. Los
  ganchos de Forward/Inverse Search están cableados para conectar PDF.js.

## Puesta en marcha

```bash
npm install
npm run compile      # o npm run watch
# Pulsa F5 en VS Code para lanzar el Extension Development Host
```

## Comandos (Cmd/Ctrl+Shift+P)

- `LaTeX Overleaf: Connect Account`
- `LaTeX Overleaf: Pull Latest Changes`
- `LaTeX Overleaf: Push Changes`
- `LaTeX Overleaf: Open Webview PDF`
- `LaTeX Overleaf: Refresh Sync Status`

## Próximos pasos (extensión futura)

- SyncTeX real embebiendo PDF.js en `media/pdfjs/`.
- Auto-sync con debounce (pull/push periódico) y merge editor en conflictos.
- Soporte multi-proyecto (varios remotos por carpeta).
```
