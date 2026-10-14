/**
 * Veeramani Surfer – Admin Command Center Controller
 *
 * Professional administrative moderation console managing live leaderboard registry,
 * individual run deletion, whole-store purges, telemetry aggregation, and CSV/JSON exports.
 */

import { pruneObsoleteStorage } from './core/StorageManager';

interface AdminLeaderboardEntry {
  id: string;
  name: string;
  score: number;
  distance: number;
  tokens: number;
  timestamp: number;
  rank?: number;
  runTimeSeconds?: number;
}

interface TelemetryStats {
  totalRuns: number;
  topScore: number;
  topRunner: string;
  avgDistance: number;
  totalTokens: number;
}

const STORAGE_AUTH_KEY = 'veeramani_admin_key';

export class AdminDashboard {
  private adminKey: string = '';
  private entries: AdminLeaderboardEntry[] = [];
  private currentFilter: 'all' | 'top10' | 'flagged' = 'all';
  private searchQuery: string = '';
  private autoSyncInterval: number | null = null;
  private isAutoSyncActive: boolean = false;

  // DOM Elements
  private authScreen = document.getElementById('auth-screen') as HTMLElement;
  private authForm = document.getElementById('auth-form') as HTMLFormElement;
  private authPasscode = document.getElementById('admin-passcode') as HTMLInputElement;
  private authError = document.getElementById('auth-error') as HTMLElement;
  private dashboard = document.getElementById('admin-dashboard') as HTMLElement;

  private metricTotalRuns = document.getElementById('metric-total-runs') as HTMLElement;
  private metricTopScore = document.getElementById('metric-top-score') as HTMLElement;
  private metricTopRunner = document.getElementById('metric-top-runner') as HTMLElement;
  private metricAvgDistance = document.getElementById('metric-avg-distance') as HTMLElement;
  private metricTotalTokens = document.getElementById('metric-total-tokens') as HTMLElement;

  private tableCountBadge = document.getElementById('table-count-badge') as HTMLElement;
  private searchInput = document.getElementById('search-input') as HTMLInputElement;
  private tbody = document.getElementById('leaderboard-tbody') as HTMLElement;
  private emptyState = document.getElementById('table-empty-state') as HTMLElement;

  private btnRefresh = document.getElementById('btn-refresh') as HTMLButtonElement;
  private btnAutoSync = document.getElementById('btn-auto-sync') as HTMLButtonElement;
  private autoSyncText = document.getElementById('auto-sync-text') as HTMLElement;
  private btnLogout = document.getElementById('btn-logout') as HTMLButtonElement;
  private btnExportCsv = document.getElementById('btn-export-csv') as HTMLButtonElement;
  private btnExportJson = document.getElementById('btn-export-json') as HTMLButtonElement;
  private btnPurgeAll = document.getElementById('btn-purge-all') as HTMLButtonElement;

  private confirmModal = document.getElementById('confirm-modal') as HTMLElement;
  private modalTitle = document.getElementById('modal-title') as HTMLElement;
  private modalMessage = document.getElementById('modal-message') as HTMLElement;
  private modalBtnCancel = document.getElementById('modal-btn-cancel') as HTMLButtonElement;
  private modalBtnConfirm = document.getElementById('modal-btn-confirm') as HTMLButtonElement;
  private onConfirmAction: (() => void) | null = null;

  private toastContainer = document.getElementById('toast-container') as HTMLElement;

  constructor() {
    pruneObsoleteStorage();
    this.initEvents();
    this.checkStoredAuth();
  }

  private initEvents(): void {
    // Auth Form
    this.authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      void this.handleLogin(this.authPasscode.value.trim());
    });

    // Refresh & Auto Sync
    this.btnRefresh.addEventListener('click', () => {
      void this.loadLeaderboard(true);
    });

    this.btnAutoSync.addEventListener('click', () => {
      this.toggleAutoSync();
    });

    // Sign Out
    this.btnLogout.addEventListener('click', () => {
      this.logout();
    });

    // Search filter
    this.searchInput.addEventListener('input', () => {
      this.searchQuery = this.searchInput.value.toLowerCase().trim();
      this.renderTable();
    });

    // Tab filter buttons
    const filterTabs = document.querySelectorAll<HTMLButtonElement>('[data-filter]');
    filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        filterTabs.forEach((t) => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        this.currentFilter = (tab.dataset['filter'] as 'all' | 'top10' | 'flagged') || 'all';
        this.renderTable();
      });
    });

    // Export Buttons
    this.btnExportCsv.addEventListener('click', () => {
      this.exportCsv();
    });

    this.btnExportJson.addEventListener('click', () => {
      this.exportJson();
    });

    // Purge All
    this.btnPurgeAll.addEventListener('click', () => {
      this.promptPurgeAll();
    });

    // Modal Actions
    this.modalBtnCancel.addEventListener('click', () => {
      this.closeModal();
    });

    this.modalBtnConfirm.addEventListener('click', () => {
      if (this.onConfirmAction) {
        this.onConfirmAction();
      }
      this.closeModal();
    });

    // Keyboard shortcut: Escape closes modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.confirmModal.classList.contains('is-open')) {
        this.closeModal();
      }
      if (e.key === '/' && document.activeElement !== this.searchInput) {
        e.preventDefault();
        this.searchInput.focus();
      }
    });
  }

  private async checkStoredAuth(): Promise<void> {
    const saved = sessionStorage.getItem(STORAGE_AUTH_KEY) || localStorage.getItem(STORAGE_AUTH_KEY);
    if (!saved) {
      this.showAuthScreen();
      return;
    }

    const valid = await this.verifyPasscode(saved);
    if (valid) {
      this.adminKey = saved;
      this.showDashboard();
      void this.loadLeaderboard();
    } else {
      sessionStorage.removeItem(STORAGE_AUTH_KEY);
      localStorage.removeItem(STORAGE_AUTH_KEY);
      this.showAuthScreen();
    }
  }

  private async handleLogin(passcode: string): Promise<void> {
    if (!passcode) return;
    this.authError.style.display = 'none';

    const valid = await this.verifyPasscode(passcode);
    if (valid) {
      this.adminKey = passcode;
      sessionStorage.setItem(STORAGE_AUTH_KEY, passcode);
      this.showDashboard();
      this.showToast('Authentication successful', 'success');
      void this.loadLeaderboard();
    } else {
      this.authError.style.display = 'block';
      this.authPasscode.focus();
      this.authPasscode.select();
    }
  }

  private async verifyPasscode(key: string): Promise<boolean> {
    try {
      const res = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify-admin', key }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private showAuthScreen(): void {
    this.authScreen.classList.remove('is-hidden');
    this.dashboard.style.display = 'none';
  }

  private showDashboard(): void {
    this.authScreen.classList.add('is-hidden');
    this.dashboard.style.display = 'flex';
  }

  private logout(): void {
    this.adminKey = '';
    sessionStorage.removeItem(STORAGE_AUTH_KEY);
    localStorage.removeItem(STORAGE_AUTH_KEY);
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
      this.autoSyncInterval = null;
    }
    this.showAuthScreen();
    this.showToast('Signed out of admin session');
  }

  private toggleAutoSync(): void {
    this.isAutoSyncActive = !this.isAutoSyncActive;
    if (this.isAutoSyncActive) {
      this.btnAutoSync.classList.add('is-active');
      this.autoSyncText.textContent = 'Auto-Sync: ON (5s)';
      this.autoSyncInterval = window.setInterval(() => {
        void this.loadLeaderboard(false);
      }, 5000);
      this.showToast('Auto-sync enabled (every 5 seconds)', 'success');
    } else {
      this.btnAutoSync.classList.remove('is-active');
      this.autoSyncText.textContent = 'Auto-Sync (5s)';
      if (this.autoSyncInterval) {
        clearInterval(this.autoSyncInterval);
        this.autoSyncInterval = null;
      }
      this.showToast('Auto-sync disabled');
    }
  }

  private async loadLeaderboard(showToastNotification: boolean = false): Promise<void> {
    try {
      const res = await fetch('/api/leaderboard?admin=1', {
        headers: {
          'x-admin-key': this.adminKey,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          this.logout();
          return;
        }
        throw new Error(`Server returned ${res.status}`);
      }

      const data = (await res.json()) as {
        entries?: AdminLeaderboardEntry[];
        stats?: TelemetryStats;
      };

      this.entries = Array.isArray(data.entries) ? data.entries : [];
      this.updateMetrics(data.stats);
      this.renderTable();

      if (showToastNotification) {
        this.showToast(`Updated: ${this.entries.length} runs loaded`, 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showToast(`Failed to sync leaderboard: ${msg}`, 'error');
    }
  }

  private updateMetrics(remoteStats?: TelemetryStats): void {
    const total = this.entries.length;
    const topScore = this.entries[0]?.score ?? 0;
    const topRunner = this.entries[0]?.name ?? 'None';
    const avgDist =
      remoteStats?.avgDistance ??
      (total > 0 ? Math.round(this.entries.reduce((sum, e) => sum + (e.distance || 0), 0) / total) : 0);
    const totalTokens =
      remoteStats?.totalTokens ?? this.entries.reduce((sum, e) => sum + (e.tokens || 0), 0);

    this.metricTotalRuns.textContent = total.toLocaleString();
    this.metricTopScore.textContent = topScore.toLocaleString();
    this.metricTopRunner.textContent = `Leader: ${topRunner}`;
    this.metricAvgDistance.textContent = `${avgDist.toLocaleString()} m`;
    this.metricTotalTokens.textContent = totalTokens.toLocaleString();
  }

  private getFilteredEntries(): AdminLeaderboardEntry[] {
    let result = [...this.entries];

    // Tab filter
    if (this.currentFilter === 'top10') {
      result = result.slice(0, 10);
    } else if (this.currentFilter === 'flagged') {
      result = result.filter((e) => {
        const estSpeed = e.runTimeSeconds && e.runTimeSeconds > 0 ? e.distance / e.runTimeSeconds : 0;
        return estSpeed > 30 || (e.score > 25000 && e.distance < 1000);
      });
    }

    // Search query
    if (this.searchQuery) {
      result = result.filter((e) => {
        return (
          e.name.toLowerCase().includes(this.searchQuery) ||
          e.id.toLowerCase().includes(this.searchQuery) ||
          String(e.rank ?? '').includes(this.searchQuery)
        );
      });
    }

    return result;
  }

  private renderTable(): void {
    const list = this.getFilteredEntries();
    this.tableCountBadge.textContent = `${list.length} of ${this.entries.length} entries`;

    if (list.length === 0) {
      this.tbody.innerHTML = '';
      this.emptyState.style.display = 'block';
      return;
    }

    this.emptyState.style.display = 'none';
    this.tbody.innerHTML = '';

    for (const entry of list) {
      const tr = document.createElement('tr');
      const rankNum = entry.rank ?? 0;

      // Estimated velocity
      const estSpeed =
        entry.runTimeSeconds && entry.runTimeSeconds > 0
          ? (entry.distance / entry.runTimeSeconds).toFixed(1)
          : '--';
      const isHighSpeed = parseFloat(estSpeed) > 30;

      // Formatted date
      const dateStr = entry.timestamp
        ? new Date(entry.timestamp).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '--';

      // Rank display
      let rankHtml = `<span>#${rankNum}</span>`;
      if (rankNum === 1) rankHtml = `<span class="rank-badge rank-gold" title="1st Place">1</span>`;
      else if (rankNum === 2) rankHtml = `<span class="rank-badge rank-silver" title="2nd Place">2</span>`;
      else if (rankNum === 3) rankHtml = `<span class="rank-badge rank-bronze" title="3rd Place">3</span>`;

      tr.innerHTML = `
        <td>
          <div class="rank-cell">${rankHtml}</div>
        </td>
        <td>
          <div class="player-name">
            <span>${this.escapeHtml(entry.name)}</span>
            ${isHighSpeed ? `<span class="tag-flagged" title="Exceeds 30m/s threshold">Fast</span>` : ''}
          </div>
        </td>
        <td>
          <span class="score-cell">${(entry.score || 0).toLocaleString()}</span>
        </td>
        <td>
          <span>${(entry.distance || 0).toLocaleString()} m</span>
        </td>
        <td>
          <span>🪙 ${(entry.tokens || 0).toLocaleString()}</span>
        </td>
        <td>
          <span style="color: ${isHighSpeed ? '#f87171' : 'var(--text-muted)'}; font-family: var(--font-mono); font-size: 0.8rem;">
            ${estSpeed !== '--' ? `${estSpeed} m/s` : '--'}
          </span>
        </td>
        <td>
          <span style="color: var(--text-dim); font-size: 0.8rem;">${dateStr}</span>
        </td>
        <td>
          <span class="device-id" title="Click to copy full device ID: ${entry.id}" data-copy="${entry.id}">
            ${this.escapeHtml(entry.id)}
          </span>
        </td>
        <td style="text-align: right;">
          <div class="action-buttons" style="justify-content: flex-end;">
            <button
              type="button"
              class="btn-table-action"
              title="Delete run from leaderboard"
              data-delete-id="${entry.id}"
              data-delete-name="${this.escapeHtml(entry.name)}"
              data-delete-score="${entry.score}"
            >
              🗑️
            </button>
          </div>
        </td>
      `;

      this.tbody.appendChild(tr);
    }

    // Attach copy handlers
    this.tbody.querySelectorAll<HTMLElement>('[data-copy]').forEach((el) => {
      el.addEventListener('click', () => {
        const text = el.dataset['copy'];
        if (text) {
          void navigator.clipboard.writeText(text);
          this.showToast(`Copied device ID: ${text}`, 'success');
        }
      });
    });

    // Attach delete handlers
    this.tbody.querySelectorAll<HTMLButtonElement>('[data-delete-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset['deleteId'];
        const name = btn.dataset['deleteName'] || 'Runner';
        const score = btn.dataset['deleteScore'] || '0';
        if (id) {
          this.promptDeleteEntry(id, name, score);
        }
      });
    });
  }

  private promptDeleteEntry(id: string, name: string, score: string): void {
    this.openModal(
      'Delete Leaderboard Entry',
      `Are you sure you want to remove the record for <strong>${name}</strong> (${parseInt(score, 10).toLocaleString()} pts)? This will recalculate ranks immediately.`,
      () => {
        void this.deleteEntry(id, name);
      },
    );
  }

  private async deleteEntry(id: string, name: string): Promise<void> {
    try {
      const res = await fetch(`/api/leaderboard?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'x-admin-key': this.adminKey,
        },
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      this.showToast(`Deleted run for ${name}`, 'success');
      await this.loadLeaderboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showToast(`Failed to delete run: ${msg}`, 'error');
    }
  }

  private promptPurgeAll(): void {
    this.openModal(
      '⚠️ Purge All Leaderboard Entries',
      `Warning: This will <strong>permanently erase ALL ${this.entries.length} leaderboard records</strong> from the database. This action cannot be reversed.`,
      () => {
        void this.purgeAllEntries();
      },
    );
  }

  private async purgeAllEntries(): Promise<void> {
    try {
      const res = await fetch('/api/leaderboard?all=true', {
        method: 'DELETE',
        headers: {
          'x-admin-key': this.adminKey,
        },
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      this.showToast('Leaderboard successfully purged', 'success');
      await this.loadLeaderboard();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.showToast(`Failed to purge leaderboard: ${msg}`, 'error');
    }
  }

  private exportCsv(): void {
    if (this.entries.length === 0) {
      this.showToast('No entries to export', 'error');
      return;
    }

    const headers = ['Rank', 'Runner Name', 'Score', 'Distance (m)', 'Tokens', 'Timestamp', 'Date ISO', 'Device ID'];
    const rows = this.entries.map((e, index) => [
      index + 1,
      `"${e.name.replace(/"/g, '""')}"`,
      e.score,
      e.distance,
      e.tokens,
      e.timestamp,
      `"${new Date(e.timestamp).toISOString()}"`,
      `"${e.id}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veeramani-surfer-leaderboard-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    this.showToast(`Exported ${this.entries.length} records to CSV`, 'success');
  }

  private exportJson(): void {
    if (this.entries.length === 0) {
      this.showToast('No entries to export', 'error');
      return;
    }

    const jsonStr = JSON.stringify(this.entries, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `veeramani-surfer-leaderboard-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.showToast(`Exported ${this.entries.length} records to JSON`, 'success');
  }

  private openModal(title: string, htmlMessage: string, onConfirm: () => void): void {
    this.modalTitle.textContent = title;
    this.modalMessage.innerHTML = htmlMessage;
    this.onConfirmAction = onConfirm;
    this.confirmModal.classList.add('is-open');
  }

  private closeModal(): void {
    this.confirmModal.classList.remove('is-open');
    this.onConfirmAction = null;
  }

  private showToast(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span><span>${this.escapeHtml(message)}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// Bootstrap
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    new AdminDashboard();
  });
}
