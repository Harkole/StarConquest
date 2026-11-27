import type { MatchOutcomeSummary } from '../app/appStateMachine.ts';
import { FACTION_PALETTES } from '../renderer/factionColors.ts';
import { formatMatchClockSeconds } from './lobbyController.ts';

export interface PauseMenuOverlayParams {
  readonly isMultiplayer: boolean;
  readonly musicMuted: boolean;
  readonly canRestart: boolean;
}

export function renderPauseMenuOverlayHtml(params: PauseMenuOverlayParams): string {
  const { isMultiplayer, musicMuted, canRestart } = params;
  const statusBadge = isMultiplayer
    ? '<span class="hud-badge" style="background: rgba(245, 158, 11, 0.2); color: #fcd34d;">Online Match Running</span>'
    : '<span class="hud-badge" style="background: rgba(56, 189, 248, 0.2); color: #7dd3fc;">Simulation Paused</span>';

  return `
    <div class="hud-modal-backdrop" data-app-overlay="pause_menu">
      <div class="hud-modal-card">
        <div class="hud-modal-header">
          <div>
            <div class="hud-label" style="margin-bottom: 2px;">STARCONQUEST</div>
            <h2 class="hud-modal-title">Match Paused</h2>
          </div>
          ${statusBadge}
        </div>
        <p class="hud-modal-subtitle">
          ${
            isMultiplayer
              ? 'Multiplayer simulation continues in real time while this menu is open.'
              : 'Local simulation ticks are paused until you resume.'
          }
        </p>
        <div class="hud-modal-actions">
          <button type="button" class="hud-btn active" data-overlay-action="resume-match">
            Resume (Esc)
          </button>
          ${
            canRestart
              ? `<button type="button" class="hud-btn" data-overlay-action="restart-match">
                  Restart Match
                </button>`
              : ''
          }
          <button type="button" class="hud-btn" data-overlay-action="toggle-music">
            ${musicMuted ? 'Unmute Music' : 'Mute Music'}
          </button>
          <button type="button" class="hud-btn danger" data-overlay-action="quit-to-main-menu">
            Quit to Main Menu
          </button>
        </div>
      </div>
    </div>
  `;
}

export interface MatchOutcomeOverlayParams {
  readonly outcome: MatchOutcomeSummary;
  readonly elapsedSeconds: number;
}

export function renderMatchOutcomeOverlayHtml(
  params: MatchOutcomeOverlayParams,
): string {
  const { outcome, elapsedSeconds } = params;
  const isVictory = outcome.localPlayerWon;
  const headline = isVictory ? 'VICTORY' : 'DEFEAT';
  const accentColor = isVictory ? '#22c55e' : '#ef4444';
  const winnerLabel = outcome.winnerId
    ? FACTION_PALETTES[outcome.winnerId].label
    : 'No Surviving Contender';
  const reasonLabel =
    outcome.reason === 'king_of_the_hill'
      ? 'Central Super-Earth King of the Hill'
      : 'Last Command & Control Standing';

  return `
    <div class="hud-modal-backdrop" data-app-overlay="match_outcome">
      <div class="hud-modal-card" style="border-color: ${accentColor};">
        <div class="hud-modal-header">
          <div>
            <div class="hud-label" style="margin-bottom: 2px;">MATCH CONCLUDED</div>
            <h2 class="hud-modal-title" style="color: ${accentColor};">${headline}</h2>
          </div>
          <span class="hud-badge">${formatMatchClockSeconds(elapsedSeconds)}</span>
        </div>
        <div class="hud-modal-summary">
          <div><strong>Winner:</strong> ${winnerLabel}</div>
          <div><strong>Victory Condition:</strong> ${reasonLabel}</div>
        </div>
        <div class="hud-modal-actions">
          <button type="button" class="hud-btn active" data-overlay-action="rematch">
            Rematch
          </button>
          <button type="button" class="hud-btn" data-overlay-action="quit-to-main-menu">
            Return to Main Menu
          </button>
        </div>
      </div>
    </div>
  `;
}
