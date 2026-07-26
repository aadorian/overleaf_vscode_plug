import * as vscode from 'vscode';
import { OverleafSync, SyncState } from './overleafSync';

/**
 * Vista de árbol en el Explorer que muestra el estado de sincronización con
 * Overleaf. Es de solo lectura: las acciones (pull/push/refresh) viven en los
 * botones del título de la vista (ver `menus` en package.json).
 *
 * Para extender: añadir nodos hijos por archivo modificado, o un nodo de
 * "conflictos" cuando `pull` devuelva merge conflicts.
 */
export class OverleafStatusProvider implements vscode.TreeDataProvider<StatusItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly sync: OverleafSync) {
    this.sync.onDidChangeState(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(element: StatusItem): vscode.TreeItem {
    return element;
  }

  getChildren(): StatusItem[] {
    const s: SyncState = this.sync.getState();

    if (!s.connected) {
      return [
        new StatusItem(
          'No conectado',
          'Ejecuta "Connect Account"',
          new vscode.ThemeIcon('debug-disconnect'),
          { command: 'latexOverleaf.connectAccount', title: 'Connect' }
        )
      ];
    }

    const items: StatusItem[] = [
      new StatusItem(`Rama: ${s.branch ?? '—'}`, '', new vscode.ThemeIcon('git-branch')),
      new StatusItem(
        `${s.behind} por recibir`,
        'Cambios remotos pendientes de pull',
        new vscode.ThemeIcon('cloud-download')
      ),
      new StatusItem(
        `${s.ahead} por enviar`,
        'Commits locales pendientes de push',
        new vscode.ThemeIcon('cloud-upload')
      ),
      new StatusItem(
        `${s.modified} modificado(s)`,
        'Archivos con cambios sin commit',
        new vscode.ThemeIcon('edit')
      )
    ];

    if (s.lastSync) {
      items.push(
        new StatusItem(
          `Última sync: ${s.lastSync.toLocaleTimeString()}`,
          '',
          new vscode.ThemeIcon('history')
        )
      );
    }
    if (s.lastError) {
      items.push(
        new StatusItem('Error', s.lastError, new vscode.ThemeIcon('error'))
      );
    }
    return items;
  }
}

class StatusItem extends vscode.TreeItem {
  constructor(
    label: string,
    tooltip: string,
    icon: vscode.ThemeIcon,
    command?: vscode.Command
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.tooltip = tooltip;
    this.iconPath = icon;
    this.command = command;
  }
}
