import * as vscode from 'vscode';
import { OverleafSync } from './overleafSync';

/**
 * =============================================================================
 *  Auto-sync scheduler
 * =============================================================================
 *
 *  Overleaf's Git bridge has no real-time push, so "real-time-ish" sync is
 *  achieved by:
 *    - Periodic background `fetch`/`pull` on a configurable interval.
 *    - Debounced `push` after edits stop for `pushDebounceMs`.
 *
 *  Everything is opt-in via settings and fully disposable. Reacts to
 *  configuration changes at runtime, so toggling settings takes effect without
 *  reloading the window.
 * =============================================================================
 */
export class AutoSync implements vscode.Disposable {
  private pullTimer?: NodeJS.Timeout;
  private pushTimer?: NodeJS.Timeout;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly sync: OverleafSync,
    private readonly output: vscode.OutputChannel
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('latexOverleaf')) {
          this.reconfigure();
        }
      })
    );
    this.reconfigure();
  }

  private cfg() {
    return vscode.workspace.getConfiguration('latexOverleaf');
  }

  /** (Re)arm timers based on current settings. */
  private reconfigure(): void {
    this.clearPullTimer();

    const autoPull = this.cfg().get<boolean>('autoPull', false);
    const intervalSec = this.cfg().get<number>('autoPullIntervalSeconds', 60);

    if (autoPull && intervalSec > 0) {
      this.output.appendLine(`Auto-pull activado cada ${intervalSec}s.`);
      this.pullTimer = setInterval(() => {
        void this.safePull();
      }, intervalSec * 1000);
    }
  }

  private async safePull(): Promise<void> {
    try {
      // Only pull when there are no uncommitted local changes, to avoid
      // surprising merge conflicts while the user is typing.
      const state = this.sync.getState();
      if (state.modified > 0) {
        return;
      }
      await this.sync.refreshStatus();
      if (this.sync.getState().behind > 0) {
        await this.sync.pullChanges();
      }
    } catch (err) {
      this.output.appendLine(`Auto-pull error: ${err}`);
    }
  }

  /** Call on each save to schedule a debounced push (if enabled). */
  public notifySaved(): void {
    if (!this.cfg().get<boolean>('autoPushOnSave', false)) {
      return;
    }
    const debounce = this.cfg().get<number>('pushDebounceMs', 4000);
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
    }
    this.pushTimer = setTimeout(() => {
      void this.sync.pushChanges('Auto-push (VS Code)');
    }, debounce);
  }

  private clearPullTimer(): void {
    if (this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = undefined;
    }
  }

  public dispose(): void {
    this.clearPullTimer();
    if (this.pushTimer) {
      clearTimeout(this.pushTimer);
    }
    this.disposables.forEach((d) => d.dispose());
  }
}
