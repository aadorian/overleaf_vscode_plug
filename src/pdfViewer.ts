import * as vscode from 'vscode';
import * as fs from 'fs';
import { inverseSearch, openTexAtLine } from './synctex';

/**
 * =============================================================================
 *  Visor PDF integrado (WebviewPanel)
 * =============================================================================
 *
 *  Este módulo renderiza el PDF compilado dentro de un WebviewPanel de VS Code.
 *
 *  ENFOQUE
 *  -------
 *  Un Webview no puede acceder al filesystem directamente; hay que convertir la
 *  ruta local en una URI segura con `webview.asWebviewUri`. Para PDFs, el modo
 *  más simple es un <iframe>/<embed> apuntando a esa URI (el runtime de VS Code,
 *  basado en Electron/Chromium, tiene visor PDF nativo).
 *
 *  Para SyncTeX (Forward/Inverse Search) real se necesita un visor JS como
 *  PDF.js embebido, capaz de: (a) recibir mensajes `postMessage` para saltar a
 *  una página/coordenada (forward), y (b) emitir la posición al hacer
 *  doble-clic (inverse). Aquí dejamos los ganchos (`revealSyncTexLocation` y el
 *  handler de mensajes) preparados para conectar con `synctex`/PDF.js.
 *
 *  CÓMO EXTENDER
 *  -------------
 *  - Sustituir el <embed> por PDF.js self-hosted en `media/pdfjs/` para control
 *    total del render y soporte SyncTeX completo.
 *  - Recargar automáticamente al recompilar: llamar a `update()` desde el
 *    watcher de compilación (ya conectado en extension.ts).
 * =============================================================================
 */
export class PdfViewer {
  public static readonly viewType = 'latexOverleaf.pdfPreview';
  private static current: PdfViewer | undefined;

  private readonly panel: vscode.WebviewPanel;
  private pdfPath: string;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    pdfPath: string,
    private readonly extensionUri: vscode.Uri
  ) {
    this.panel = panel;
    this.pdfPath = pdfPath;

    this.update();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Canal para Inverse Search: el visor JS envía la posición y saltamos al .tex
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'inverseSearch':
            await this.handleInverseSearch(message.page, message.x, message.y);
            break;
        }
      },
      null,
      this.disposables
    );
  }

  /** Crea o revela el panel para el PDF indicado. */
  public static show(pdfPath: string, extensionUri: vscode.Uri): PdfViewer {
    const column = vscode.ViewColumn.Beside;

    if (PdfViewer.current) {
      PdfViewer.current.pdfPath = pdfPath;
      PdfViewer.current.panel.reveal(column);
      PdfViewer.current.update();
      return PdfViewer.current;
    }

    const pdfDir = vscode.Uri.file(pdfPath.substring(0, pdfPath.lastIndexOf('/')));
    const panel = vscode.window.createWebviewPanel(
      PdfViewer.viewType,
      'Overleaf PDF',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [pdfDir, vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    PdfViewer.current = new PdfViewer(panel, pdfPath, extensionUri);
    return PdfViewer.current;
  }

  /** Regenera el HTML del webview (p. ej. tras recompilar). */
  public update(): void {
    if (!fs.existsSync(this.pdfPath)) {
      this.panel.webview.html = this.getPlaceholderHtml(
        'El PDF aún no existe. Compila el documento (Ctrl/Cmd+S o el comando de compilación).'
      );
      return;
    }
    // cache-buster para forzar recarga del iframe tras recompilar
    const version = fs.statSync(this.pdfPath).mtimeMs;
    const pdfUri = this.panel.webview.asWebviewUri(vscode.Uri.file(this.pdfPath));
    this.panel.webview.html = this.getHtml(`${pdfUri}?v=${version}`);
  }

  /**
   * Forward Search: salta en el PDF a la ubicación correspondiente a una línea
   * del .tex. Requiere resolver la posición con `synctex view` y enviarla al
   * visor JS. Placeholder listo para conectar (ver extension.ts).
   */
  public revealSyncTexLocation(page: number, x: number, y: number): void {
    this.panel.webview.postMessage({ type: 'forwardSearch', page, x, y });
  }

  /** Devuelve la ruta del PDF actualmente mostrado. */
  public getPdfPath(): string {
    return this.pdfPath;
  }

  private async handleInverseSearch(page: number, x: number, y: number): Promise<void> {
    try {
      const hit = await inverseSearch(this.pdfPath, page, x, y);
      if (hit) {
        await openTexAtLine(hit.file, hit.line);
      } else {
        vscode.window.showWarningMessage(
          'SyncTeX: no se encontró la posición en el .tex.'
        );
      }
    } catch (err) {
      vscode.window.showErrorMessage(`SyncTeX inverse search falló: ${err}`);
    }
  }

  private getNonce(): string {
    return Array.from({ length: 32 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
        Math.floor(Math.random() * 62)
      )
    ).join('');
  }

  private getHtml(pdfSrc: string): string {
    const nonce = this.getNonce();
    const csp = [
      `default-src 'none'`,
      `frame-src ${this.panel.webview.cspSource} data:`,
      `img-src ${this.panel.webview.cspSource} data:`,
      `style-src 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #525659; }
    iframe { border: none; width: 100%; height: 100vh; }
  </style>
</head>
<body>
  <iframe id="pdf" src="${pdfSrc}" title="PDF compilado"></iframe>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    // Gancho Forward Search: al recibir coordenadas desde la extensión,
    // aquí se haría scroll/highlight cuando se use PDF.js en lugar de <iframe>.
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'forwardSearch') {
        console.log('Forward search →', msg);
      }
    });
  </script>
</body>
</html>`;
  }

  private getPlaceholderHtml(message: string): string {
    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="font-family: sans-serif; color: #ccc; background:#525659; display:flex; align-items:center; justify-content:center; height:100vh; text-align:center; padding:2rem;">
  <p>${message}</p>
</body></html>`;
  }

  public dispose(): void {
    PdfViewer.current = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
