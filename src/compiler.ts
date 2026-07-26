import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';

/**
 * =============================================================================
 *  Compilación LaTeX local
 * =============================================================================
 *
 *  RECOMENDACIÓN DE ARQUITECTURA
 *  -----------------------------
 *  Existen dos caminos:
 *
 *  1) Delegar en la extensión **LaTeX Workshop** (james-yu.latex-workshop),
 *     que ya resuelve compilación robusta, SyncTeX y visor. Si está instalada,
 *     lo ideal es NO reinventar y simplemente invocar sus comandos:
 *         vscode.commands.executeCommand('latex-workshop.build')
 *         vscode.commands.executeCommand('latex-workshop.synctex')
 *     Nuestro plugin aporta entonces solo la capa Overleaf/Git.
 *
 *  2) Compilar nosotros mismos con `latexmk`/`pdflatex` (lo que hace esta clase),
 *     útil cuando no se quiere depender de LaTeX Workshop.
 *
 *  `detectLatexWorkshop()` permite elegir en tiempo de ejecución.
 * =============================================================================
 */

export function isLatexWorkshopAvailable(): boolean {
  return !!vscode.extensions.getExtension('James-Yu.latex-workshop');
}

export class LatexCompiler {
  constructor(
    private readonly workspaceRoot: string,
    private readonly output: vscode.OutputChannel
  ) {}

  /**
   * Compila el archivo .tex principal. Prefiere LaTeX Workshop si está presente;
   * si no, ejecuta latexmk/pdflatex directamente.
   * Devuelve la ruta del PDF resultante.
   */
  public async compile(mainTex: string): Promise<string> {
    if (isLatexWorkshopAvailable()) {
      this.output.appendLine('Compilando vía LaTeX Workshop…');
      await vscode.commands.executeCommand('latex-workshop.build');
      return this.pdfPathFor(mainTex);
    }
    return this.compileWithCli(mainTex);
  }

  private pdfPathFor(mainTex: string): string {
    const dir = path.dirname(mainTex);
    const base = path.basename(mainTex, '.tex');
    return path.join(dir, `${base}.pdf`);
  }

  private compileWithCli(mainTex: string): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('latexOverleaf');
    const tool = cfg.get<string>('latexCommand', 'latexmk');
    const dir = path.dirname(mainTex);
    const file = path.basename(mainTex);

    // -synctex=1 habilita la generación del .synctex.gz (Forward/Inverse search).
    const args =
      tool === 'latexmk'
        ? ['-pdf', '-synctex=1', '-interaction=nonstopmode', '-file-line-error', file]
        : ['-synctex=1', '-interaction=nonstopmode', '-file-line-error', file];

    return new Promise<string>((resolve, reject) => {
      this.output.appendLine(`$ ${tool} ${args.join(' ')} (cwd: ${dir})`);
      const proc = spawn(tool, args, { cwd: dir });

      proc.stdout.on('data', (d) => this.output.append(d.toString()));
      proc.stderr.on('data', (d) => this.output.append(d.toString()));

      proc.on('error', (err) =>
        reject(new Error(`No se pudo ejecutar "${tool}". ¿Está instalado en PATH? ${err.message}`))
      );
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(this.pdfPathFor(mainTex));
        } else {
          reject(new Error(`Compilación fallida (código ${code}). Revisa el Output.`));
        }
      });
    });
  }
}
