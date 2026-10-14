/**
 * Leaderboard screen controller.
 *
 * Manages rendering the tabbed leaderboard modal (Global vs My Runs),
 * medal badges, current-player highlighting, and sticky rank footer.
 */

import type { LeaderboardSummary, LeaderboardTab } from '../gameplay/leaderboard/LeaderboardTypes';
import { bindTarget, formatDistance, formatScore, optionalElement, setTextIfChanged } from './Dom';

export interface LeaderboardEvents {
  onTabChange?(tab: LeaderboardTab): void;
}

export class LeaderboardController {
  private readonly root = optionalElement<HTMLElement>(document, '[data-screen="leaderboard"]');
  private readonly tbody = bindTarget(document, 'leaderboard-rows');
  private readonly emptyMsg = bindTarget(document, 'leaderboard-empty');
  private readonly userRank = bindTarget(document, 'leaderboard-user-rank');
  private readonly userScore = bindTarget(document, 'leaderboard-user-score');

  get element(): HTMLElement | null {
    return this.root;
  }

  get activeTab(): LeaderboardTab {
    return 'global';
  }

  constructor(_events?: LeaderboardEvents) {}

  render(summary: LeaderboardSummary): void {
    if (!this.tbody) return;
    this.tbody.innerHTML = '';

    const entries = summary.entries;
    if (entries.length === 0) {
      if (this.emptyMsg) this.emptyMsg.hidden = false;
    } else {
      if (this.emptyMsg) this.emptyMsg.hidden = true;

      for (const entry of entries) {
        const tr = document.createElement('tr');
        if (entry.isCurrentPlayer) {
          tr.className = 'leaderboard-row is-player-row';
        } else {
          tr.className = 'leaderboard-row';
        }

        // Rank column with medals for top 3
        const tdRank = document.createElement('td');
        tdRank.className = 'col-rank';
        const rankNum = entry.rank ?? 0;
        if (rankNum === 1) {
          tdRank.innerHTML = '<span class="rank-badge rank-badge--gold" title="1st Place">🥇 1</span>';
        } else if (rankNum === 2) {
          tdRank.innerHTML = '<span class="rank-badge rank-badge--silver" title="2nd Place">🥈 2</span>';
        } else if (rankNum === 3) {
          tdRank.innerHTML = '<span class="rank-badge rank-badge--bronze" title="3rd Place">🥉 3</span>';
        } else {
          tdRank.textContent = `#${rankNum}`;
        }

        // Name column
        const tdName = document.createElement('td');
        tdName.className = 'col-name';
        tdName.textContent = entry.name;
        if (entry.isCurrentPlayer) {
          const youBadge = document.createElement('span');
          youBadge.className = 'tag-you';
          youBadge.textContent = 'YOU';
          tdName.appendChild(youBadge);
        }

        // Score column
        const tdScore = document.createElement('td');
        tdScore.className = 'col-score';
        tdScore.textContent = formatScore(entry.score);

        // Distance column
        const tdDist = document.createElement('td');
        tdDist.className = 'col-dist';
        tdDist.textContent = formatDistance(entry.distance);

        tr.append(tdRank, tdName, tdScore, tdDist);
        this.tbody.appendChild(tr);
      }
    }

    // Update bottom footer bar with user's stats
    if (summary.playerRank && summary.playerBest) {
      setTextIfChanged(this.userRank, `Your Rank: #${summary.playerRank}`);
      setTextIfChanged(this.userScore, `Best: ${formatScore(summary.playerBest.score)}`);
    } else {
      setTextIfChanged(this.userRank, 'Your Rank: --');
      setTextIfChanged(this.userScore, 'Best: 0');
    }
  }
}
