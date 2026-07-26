import * as vscode from 'vscode';
import { OverleafSync, resolveMainTex } from './overleafSync';
import { OverleafStatusProvider } from './statusView';
import { PdfViewer } from './pdfViewer';
import { LatexCompiler, isLatexWorkshopAvailable } from './compiler';

/**
 * =============================================================================
 *  Punto de entrada de la extensión "LaTeX Overleaf Sync"
 * =============================================================================
 *
 *  Responsabilidades de este archivo:
 *   - Instanciar los módulos (sync, compiler, viewer, vista lateral).
 *   - Registrar los comandos de la paleta y la vista del Explorer.
 *   - Gestionar el ciclo de vida (activate/deactivate) y la limpieza vía
 *     `context.subscriptions`.
 *
 *  La lógica de dominio vive en sus módulos; aquí solo cableamos.
 * =============================================================================
 */

let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('LaTeX Overleaf');
  context.subscriptions.push(output);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showWarningMessage(
      'LaTeX Overleaf: abre una carpeta/proyecto para usar la sincronización.'
    );
    return;
  }

  // --- Módulos ------------------------------------------------------------
  const sync = new OverleafSync(workspaceRoot, context.secrets, output);
  const compiler = new LatexCompiler(workspaceRoot, output);
  context.subscriptions.push(sync);

  // --- Vista lateral (Explorer) ------------------------------------------
  const statusProvider = new OverleafStatusProvider(sync);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('latexOverleaf.statusView', statusProvider)
  );

  // --- Barra de estado ----------------------------------------------------
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'latexOverleaf.refreshStatus';
  context.subscriptions.push(statusBar);
  const updateStatusBar = () => {
    const s = sync.getState();
    statusBar.text = s.connected
      ? `$(sync) Overleaf ↓${s.behind} ↑${s.ahead}`
      : `$(debug-disconnect) Overleaf`;
    statusBar.tooltip = 'Estado de sincronización con Overleaf';
    statusBar.show();
  };
  context.subscriptions.push(sync.onDidChangeState(updateStatusBar));
  updateStatusBar();

  // --- Helper de compilación + refresco del visor -------------------------
  const compileAndPreview = async (openViewer: boolean): Promise<void> => {
    const mainTex = resolveMainTex(workspaceRoot);
    try {
      const pdfPath = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Compilando LaTeX…' },
        () => compiler.compile(mainTex)
      );
      if (openViewer) {
        PdfViewer.show(pdfPath, context.extensionUri);
      } else {
        // Si el visor ya está abierto, se refresca con el PDF nuevo.
        PdfViewer.show(pdfPath, context.extensionUri).update();
      }
    } catch (err) {
      vscode.window.showErrorMessage(`${err}`);
    }
  };

  // --- Comandos -----------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('latexOverleaf.connectAccount', () =>
      sync.connectAccount()
    ),
    vscode.commands.registerCommand('latexOverleaf.pull', () => sync.pullChanges()),
    vscode.commands.registerCommand('latexOverleaf.push', () => sync.pushChanges()),
    vscode.commands.registerCommand('latexOverleaf.refreshStatus', () =>
      sync.refreshStatus()
    ),
    vscode.commands.registerCommand('latexOverleaf.openPdf', () =>
      compileAndPreview(true)
    )
  );

  // --- Compilar al guardar + auto-push opcional --------------------------
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      if (doc.languageId !== 'latex') {
        return;
      }
      const cfg = vscode.workspace.getConfiguration('latexOverleaf');
      if (cfg.get<boolean>('compileOnSave', true)) {
        await compileAndPreview(false);
      }
      if (cfg.get<boolean>('autoPushOnSave', false)) {
        await sync.pushChanges('Auto-push al guardar (VS Code)');
      }
    })
  );

  // --- Estado inicial -----------------------------------------------------
  sync.refreshStatus();

  if (isLatexWorkshopAvailable()) {
    output.appendLine('LaTeX Workshop detectado: se usará para compilar/SyncTeX.');
  } else {
    output.appendLine('LaTeX Workshop no detectado: se usará latexmk/pdflatex del PATH.');
  }
  output.appendLine('Extensión "LaTeX Overleaf Sync" activada.');
}

export function deactivate(): void {
  output?.appendLine('Extensión desactivada.');
}
