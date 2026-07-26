import * as vscode from 'vscode';
import * as path from 'path';
import simpleGit, { SimpleGit, StatusResult } from 'simple-git';

/**
 * =============================================================================
 *  Módulo de Sincronización con Overleaf
 * =============================================================================
 *
 *  ESTRATEGIA RECOMENDADA: Git-over-HTTPS
 *  --------------------------------------
 *  Overleaf (tanto la versión SaaS como Server Pro / Community con Git bridge
 *  habilitado) expone cada proyecto como un repositorio Git remoto:
 *
 *      https://git.overleaf.com/<PROJECT_ID>
 *
 *  Esto convierte la sincronización bidireccional en un problema de Git estándar
 *  (clone / pull / push), lo cual es MUCHO más robusto y mantenible que hacer
 *  ingeniería inversa de la API interna de WebSockets de Overleaf (que no es
 *  pública ni estable).
 *
 *  AUTENTICACIÓN
 *  -------------
 *  Overleaf usa Git Authentication Tokens (Account → Settings → Git). El token
 *  se usa como password en HTTP Basic Auth. NUNCA lo guardamos en settings.json;
 *  lo persistimos en `vscode.SecretStorage` (llavero del SO).
 *
 *  CÓMO EXTENDER EN EL FUTURO
 *  --------------------------
 *  - Sincronización "en tiempo real": envolver `push`/`pull` en un watcher con
 *    debounce, o hacer polling de `git fetch` cada N segundos y notificar
 *    conflictos. Overleaf no ofrece push en tiempo real vía Git, así que el
 *    "tiempo real" práctico es un auto-pull/auto-push con debounce.
 *  - Resolución de conflictos: exponer un merge editor de VS Code cuando
 *    `pull` devuelva conflictos (ver `pullChanges`).
 *  - Soporte multi-proyecto: mapear varios remotos por carpeta de workspace.
 * =============================================================================
 */

const SECRET_TOKEN_KEY = 'latexOverleaf.gitToken';

export interface SyncState {
  connected: boolean;
  branch?: string;
  ahead: number;
  behind: number;
  modified: number;
  lastSync?: Date;
  lastError?: string;
}

export class OverleafSync {
  private git: SimpleGit;
  private readonly workspaceRoot: string;

  /** Se emite cada vez que cambia el estado de sincronización (para la UI). */
  private readonly _onDidChangeState = new vscode.EventEmitter<SyncState>();
  public readonly onDidChangeState = this._onDidChangeState.event;

  private state: SyncState = { connected: false, ahead: 0, behind: 0, modified: 0 };

  constructor(
    workspaceRoot: string,
    private readonly secrets: vscode.SecretStorage,
    private readonly output: vscode.OutputChannel
  ) {
    this.workspaceRoot = workspaceRoot;
    this.git = simpleGit({ baseDir: workspaceRoot });
  }

  public getState(): SyncState {
    return this.state;
  }

  private emit(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    this._onDidChangeState.fire(this.state);
  }

  private log(msg: string): void {
    this.output.appendLine(`[${new Date().toISOString()}] ${msg}`);
  }

  /**
   * Devuelve la URL remota con el token incrustado para HTTP Basic Auth.
   * Formato: https://git:<TOKEN>@git.overleaf.com/<PROJECT_ID>
   *
   * Incrustar el token en la URL evita depender del credential helper del SO,
   * pero implica que el token queda en el remoto de git. Por eso lo escribimos
   * en un remoto efímero por operación en lugar de persistirlo en `.git/config`.
   */
  private buildAuthenticatedUrl(baseUrl: string, token: string): string {
    const u = new URL(baseUrl);
    u.username = 'git';
    u.password = token;
    return u.toString();
  }

  private getConfiguredUrl(): string {
    return vscode.workspace
      .getConfiguration('latexOverleaf')
      .get<string>('overleafGitUrl', '')
      .trim();
  }

  // ---------------------------------------------------------------------------
  //  Conexión / Autenticación
  // ---------------------------------------------------------------------------

  /**
   * Pide el token al usuario, lo valida contra el remoto configurado y lo
   * guarda en SecretStorage. Si la carpeta aún no es un repo git, la inicializa
   * y hace el primer clone/pull.
   */
  public async connectAccount(): Promise<void> {
    const gitUrl = this.getConfiguredUrl();
    if (!gitUrl) {
      const pick = await vscode.window.showInputBox({
        title: 'URL del repositorio Git de Overleaf',
        prompt: 'Ejemplo: https://git.overleaf.com/<PROJECT_ID>',
        ignoreFocusOut: true,
        validateInput: (v) => (v.startsWith('http') ? undefined : 'Debe ser una URL http(s)')
      });
      if (!pick) {
        return;
      }
      await vscode.workspace
        .getConfiguration('latexOverleaf')
        .update('overleafGitUrl', pick.trim(), vscode.ConfigurationTarget.Workspace);
    }

    const token = await vscode.window.showInputBox({
      title: 'Overleaf Git Token',
      prompt: 'Genera uno en Overleaf: Account → Settings → Git Integration.',
      password: true,
      ignoreFocusOut: true
    });
    if (!token) {
      return;
    }

    await this.secrets.store(SECRET_TOKEN_KEY, token);
    this.log('Token de Overleaf almacenado en SecretStorage.');

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Conectando con Overleaf…' },
      async () => {
        await this.ensureRepo();
        await this.refreshStatus();
      }
    );

    this.emit({ connected: true });
    vscode.window.showInformationMessage('Overleaf: cuenta conectada correctamente.');
  }

  private async getToken(): Promise<string> {
    const token = await this.secrets.get(SECRET_TOKEN_KEY);
    if (!token) {
      throw new Error('No hay token de Overleaf. Ejecuta "LaTeX Overleaf: Connect Account".');
    }
    return token;
  }

  /**
   * Asegura que la carpeta es un repositorio git enlazado con Overleaf.
   * - Si ya es repo: no hace nada.
   * - Si está vacía: hace `git clone` del proyecto Overleaf.
   * - Si tiene archivos pero no es repo: `git init` + `remote add` + `pull`.
   */
  private async ensureRepo(): Promise<void> {
    const gitUrl = this.getConfiguredUrl();
    const token = await this.getToken();
    const authedUrl = this.buildAuthenticatedUrl(gitUrl, token);

    const isRepo = await this.git.checkIsRepo().catch(() => false);
    if (isRepo) {
      await this.setRemote(authedUrl);
      return;
    }

    const fs = await import('fs/promises');
    const entries = await fs.readdir(this.workspaceRoot).catch(() => []);
    const meaningful = entries.filter((e) => e !== '.git' && !e.startsWith('.'));

    if (meaningful.length === 0) {
      this.log(`Clonando proyecto Overleaf en ${this.workspaceRoot}…`);
      await simpleGit().clone(authedUrl, this.workspaceRoot);
      this.git = simpleGit({ baseDir: this.workspaceRoot });
    } else {
      this.log('Carpeta con contenido: git init + pull.');
      await this.git.init();
      await this.setRemote(authedUrl);
      await this.git.pull('origin', 'master', { '--allow-unrelated-histories': null });
    }
  }

  /** Escribe el remoto `origin` con la URL autenticada (idempotente). */
  private async setRemote(authedUrl: string): Promise<void> {
    const remotes = await this.git.getRemotes();
    if (remotes.find((r) => r.name === 'origin')) {
      await this.git.remote(['set-url', 'origin', authedUrl]);
    } else {
      await this.git.addRemote('origin', authedUrl);
    }
  }

  // ---------------------------------------------------------------------------
  //  Operaciones de sincronización
  // ---------------------------------------------------------------------------

  public async pullChanges(): Promise<void> {
    await this.withRepo(async () => {
      this.log('Pull desde Overleaf…');
      const result = await this.git.pull('origin', undefined, { '--no-rebase': null });
      if (result.files.length > 0) {
        vscode.window.showInformationMessage(
          `Overleaf: ${result.files.length} archivo(s) actualizado(s).`
        );
      } else {
        vscode.window.showInformationMessage('Overleaf: ya estás al día.');
      }
      await this.refreshStatus();
    }, 'Pull desde Overleaf');
  }

  /**
   * Añade todos los cambios, hace commit y push. En un escenario real conviene
   * detectar conflictos y ofrecer el merge editor; aquí hacemos un pull previo
   * para minimizar rechazos por non-fast-forward.
   */
  public async pushChanges(commitMessage?: string): Promise<void> {
    await this.withRepo(async () => {
      const status = await this.git.status();
      if (status.files.length === 0) {
        vscode.window.showInformationMessage('Overleaf: no hay cambios locales que enviar.');
        return;
      }

      const msg =
        commitMessage ??
        (await vscode.window.showInputBox({
          title: 'Mensaje de commit',
          value: `Update from VS Code (${new Date().toLocaleString()})`,
          ignoreFocusOut: true
        }));
      if (!msg) {
        return;
      }

      this.log(`Push a Overleaf: "${msg}"`);
      await this.git.add('.');
      await this.git.commit(msg);
      // Pull antes de push para integrar cambios remotos (evita non-fast-forward).
      await this.git.pull('origin', undefined, { '--no-rebase': null }).catch((e) => {
        this.log(`Aviso durante pull previo al push: ${e}`);
      });
      await this.git.push('origin');
      vscode.window.showInformationMessage('Overleaf: cambios enviados.');
      await this.refreshStatus();
    }, 'Push a Overleaf');
  }

  /** Recalcula ahead/behind/modified y refresca la UI. */
  public async refreshStatus(): Promise<void> {
    try {
      const isRepo = await this.git.checkIsRepo().catch(() => false);
      if (!isRepo) {
        this.emit({ connected: false });
        return;
      }
      await this.git.fetch().catch(() => undefined);
      const status: StatusResult = await this.git.status();
      const hasToken = !!(await this.secrets.get(SECRET_TOKEN_KEY));
      this.emit({
        connected: hasToken,
        branch: status.current ?? undefined,
        ahead: status.ahead,
        behind: status.behind,
        modified: status.files.length,
        lastSync: new Date(),
        lastError: undefined
      });
    } catch (err) {
      this.emit({ lastError: String(err) });
    }
  }

  /** Envuelve una operación con manejo de errores + barra de progreso. */
  private async withRepo(
    fn: () => Promise<void>,
    title: string
  ): Promise<void> {
    try {
      await this.ensureRepo();
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title },
        fn
      );
    } catch (err) {
      this.log(`ERROR (${title}): ${err}`);
      this.emit({ lastError: String(err) });
      vscode.window.showErrorMessage(`${title} falló: ${err}`);
    }
  }

  public dispose(): void {
    this._onDidChangeState.dispose();
  }
}

/** Utilidad para resolver la ruta absoluta del .tex principal configurado. */
export function resolveMainTex(workspaceRoot: string): string {
  const rel = vscode.workspace
    .getConfiguration('latexOverleaf')
    .get<string>('mainTexFile', 'main.tex');
  return path.isAbsolute(rel) ? rel : path.join(workspaceRoot, rel);
}
