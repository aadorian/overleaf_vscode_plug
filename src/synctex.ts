import * as vscode from 'vscode';
import * as fs from 'fs';
import { execFile } from 'child_process';

/**
 * =============================================================================
 *  SyncTeX helpers (Forward / Inverse search)
 * =============================================================================
 *
 *  Forward search: given a line in a `.tex` file, ask the `synctex` binary where
 *  that line renders in the PDF, and return the page + coordinates so the viewer
 *  can scroll/highlight there.
 *
 *  Inverse search: given a page + coordinates (from a click in the viewer),
 *  resolve the originating `.tex` file and line.
 *
 *  Requires the `synctex` CLI (ships with TeX Live / MiKTeX) and a
 *  `<basename>.synctex.gz` produced by compiling with `-synctex=1`.
 * =============================================================================
 */

export interface ForwardResult {
  page: number;
  x: number;
  y: number;
}

export interface InverseResult {
  file: string;
  line: number;
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });
}

/** Parse the `key:value` block that `synctex view/edit` prints. */
function parseSynctexOutput(output: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const line of output.split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key === 'Page' || key === 'Output') {
      if (current) {
        records.push(current);
      }
      current = {};
    }
    if (current) {
      current[key] = value;
    }
  }
  if (current) {
    records.push(current);
  }
  return records;
}

/**
 * Forward search: locate `line` of `texFile` inside `pdfFile`.
 * Returns the first matching hit, or undefined if none is found.
 */
export async function forwardSearch(
  texFile: string,
  line: number,
  column: number,
  pdfFile: string
): Promise<ForwardResult | undefined> {
  if (!fs.existsSync(pdfFile)) {
    throw new Error('El PDF aún no existe. Compila el documento primero.');
  }
  const spec = `${line}:${column}:${texFile}`;
  const output = await run('synctex', ['view', '-i', spec, '-o', pdfFile]);
  const records = parseSynctexOutput(output);
  const hit = records.find((r) => r.Page && r.x && r.y);
  if (!hit) {
    return undefined;
  }
  return {
    page: parseInt(hit.Page, 10),
    x: parseFloat(hit.x),
    y: parseFloat(hit.y)
  };
}

/**
 * Inverse search: resolve which `.tex` line produced the given PDF coordinates.
 */
export async function inverseSearch(
  pdfFile: string,
  page: number,
  x: number,
  y: number
): Promise<InverseResult | undefined> {
  const spec = `${page}:${x}:${y}:${pdfFile}`;
  const output = await run('synctex', ['edit', '-o', spec]);
  const records = parseSynctexOutput(output);
  const hit = records.find((r) => r.Input && r.Line);
  if (!hit) {
    return undefined;
  }
  return { file: hit.Input, line: parseInt(hit.Line, 10) };
}

/** Open a `.tex` file at a given 1-based line in the editor. */
export async function openTexAtLine(file: string, line: number): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(file);
  const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
  const pos = new vscode.Position(Math.max(0, line - 1), 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
}
