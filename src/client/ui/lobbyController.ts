import {
  AI_DIFFICULTY_IDS,
  AI_DIFFICULTY_PROFILES,
  MATCH_PRESETS,
  PLAYER_SLOT_IDS,
  getDefaultSlotsForPreset,
  normalizeMatchSetupConfig,
  type AIDifficultyId,
  type MatchPresetId,
  type MatchSetupConfig,
  type MatchSetupInput,
  type PlayerSlotConfig,
} from '../../shared/config/index.ts';
import type { PlayerSlotId } from '../../shared/protocol/commands.ts';
import type {
  GameSimulation,
  MatchOutcomeState,
  PlayerStandingSummary,
} from '../../shared/sim/gameSimulation.ts';
import { FACTION_PALETTES } from '../renderer/factionColors.ts';

const MATCH_PRESET_IDS: readonly MatchPresetId[] = [
  'tutorial',
  'blitz_skirmish',
  'standard_tactical',
  'grand_conquest',
] as const;

export interface LobbySceneManagerContract {
  readonly simAdapter: {
    readonly localPlayerId: PlayerSlotId;
    readonly simulation: GameSimulation;
  };
  resetMatch(
    presetOrSetup: MatchPresetId | MatchSetupInput,
  ): MatchSetupConfig;
}

export interface LobbyControllerOptions {
  readonly hostContainer: HTMLElement;
  readonly sceneManager: LobbySceneManagerContract;
  readonly onMatchLaunched?: (setup: MatchSetupConfig) => void;
  readonly onOpenStateChange?: (isOpen: boolean) => void;
}

export function formatMatchClockSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatStandingBadge(standing: PlayerStandingSummary | undefined): {
  readonly text: string;
  readonly tone: 'active' | 'defeated' | 'empty';
} {
  if (!standing || !standing.isActiveContender) {
    return {
      text: 'EMPTY SECTOR • Unclaimed Homeworld',
      tone: 'empty',
    };
  }
  if (standing.isDefeated) {
    return {
      text: 'DEFEATED • C&C Destroyed',
      tone: 'defeated',
    };
  }
  return {
    text: `ACTIVE C&C • ${standing.ownedPlanetCount} Planet${standing.ownedPlanetCount === 1 ? '' : 's'} • ${standing.activeFleetShipCount} Ship${standing.activeFleetShipCount === 1 ? '' : 's'}`,
    tone: 'active',
  };
}

export class LobbyController {
  private readonly sceneManager: LobbySceneManagerContract;
  private readonly onMatchLaunched?: (setup: MatchSetupConfig) => void;
  private readonly onOpenStateChange?: (isOpen: boolean) => void;

  private readonly rootEl: HTMLElement;
  private readonly kothBannerEl: HTMLElement;
  private readonly outcomeBannerEl: HTMLElement;
  private readonly drawerEl: HTMLElement;

  private isOpen = false;
  private draftSetup: MatchSetupConfig;
  private outcomeBannerDismissed = false;
  private lastOutcomeSig = '';

  constructor(options: LobbyControllerOptions) {
    this.sceneManager = options.sceneManager;
    this.onMatchLaunched = options.onMatchLaunched;
    this.onOpenStateChange = options.onOpenStateChange;
    this.draftSetup = normalizeMatchSetupConfig(
      this.sceneManager.simAdapter.simulation.getMatchSetup(),
    );

    this.rootEl = document.createElement('div');
    this.rootEl.className = 'hud-lobby-host';

    this.kothBannerEl = document.createElement('div');
    this.kothBannerEl.className = 'hud-koth-banner';
    this.kothBannerEl.dataset.hudPanel = 'koth-telemetry-banner';
    this.kothBannerEl.style.display = 'none';

    this.outcomeBannerEl = document.createElement('div');
    this.outcomeBannerEl.className = 'hud-outcome-banner';
    this.outcomeBannerEl.dataset.hudPanel = 'match-outcome-banner';
    this.outcomeBannerEl.style.display = 'none';

    this.drawerEl = document.createElement('div');
    this.drawerEl.className = 'hud-lobby-drawer';
    this.drawerEl.dataset.hudPanel = 'lobby-drawer';
    this.drawerEl.style.display = 'none';

    this.rootEl.append(this.kothBannerEl, this.outcomeBannerEl, this.drawerEl);
    options.hostContainer.append(this.rootEl);

    this.syncTelemetry();
  }

  public getRootElement(): HTMLElement {
    return this.rootEl;
  }

  public isLobbyOpen(): boolean {
    return this.isOpen;
  }

  public getDraftSetup(): MatchSetupConfig {
    return this.draftSetup;
  }

  public openLobby(): void {
    this.draftSetup = normalizeMatchSetupConfig(
      this.sceneManager.simAdapter.simulation.getMatchSetup(),
    );
    this.isOpen = true;
    this.drawerEl.style.display = 'flex';
    this.renderDrawer();
    this.onOpenStateChange?.(this.isOpen);
  }

  public closeLobby(): void {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.drawerEl.style.display = 'none';
    this.onOpenStateChange?.(this.isOpen);
  }

  public toggleLobby(): void {
    if (this.isOpen) {
      this.closeLobby();
    } else {
      this.openLobby();
    }
  }

  public syncTelemetry(): void {
    const sim = this.sceneManager.simAdapter.simulation;
    const outcome = sim.getMatchOutcome();

    this.patchKothBanner(outcome);
    this.patchOutcomeBanner(sim, outcome);

    if (this.isOpen) {
      this.patchLiveStandingsInDrawer(outcome);
    }
  }

  public setDraftPreset(presetId: MatchPresetId): void {
    this.draftSetup = normalizeMatchSetupConfig(
      presetId === 'tutorial'
        ? {
            presetId,
            localPlayerId: 'player_1',
            slots: getDefaultSlotsForPreset('tutorial'),
          }
        : {
            ...this.draftSetup,
            presetId,
          },
    );
    this.renderDrawer();
  }

  public setDraftSlotRole(
    slotId: PlayerSlotId,
    role: 'human' | 'ai' | 'empty',
  ): void {
    const currentSlot = this.draftSetup.slots[slotId];
    let nextSlot: PlayerSlotConfig;
    if (role === 'human') {
      nextSlot = { kind: 'human' };
    } else if (role === 'empty') {
      nextSlot = { kind: 'empty' };
    } else {
      const prevDiff: AIDifficultyId =
        currentSlot.kind === 'ai' ? currentSlot.difficulty : 'standard';
      nextSlot = { kind: 'ai', difficulty: prevDiff };
    }

    const nextSlots: Record<PlayerSlotId, PlayerSlotConfig> = {
      ...this.draftSetup.slots,
      [slotId]: nextSlot,
    };

    const hasActive = PLAYER_SLOT_IDS.some(
      (id) => nextSlots[id].kind !== 'empty',
    );
    if (!hasActive) {
      nextSlots[slotId] = { kind: 'human' };
    }

    const nextLocalPlayerId =
      role === 'human'
        ? slotId
        : nextSlots[this.draftSetup.localPlayerId].kind === 'human'
          ? this.draftSetup.localPlayerId
          : (PLAYER_SLOT_IDS.find((id) => nextSlots[id].kind === 'human') ??
            PLAYER_SLOT_IDS.find((id) => nextSlots[id].kind !== 'empty') ??
            'player_1');

    this.draftSetup = normalizeMatchSetupConfig({
      presetId: this.draftSetup.presetId,
      localPlayerId: nextLocalPlayerId,
      slots: nextSlots,
    });
    this.renderDrawer();
  }

  public setDraftSlotDifficulty(
    slotId: PlayerSlotId,
    difficulty: AIDifficultyId,
  ): void {
    this.draftSetup = normalizeMatchSetupConfig({
      presetId: this.draftSetup.presetId,
      localPlayerId: this.draftSetup.localPlayerId,
      slots: {
        ...this.draftSetup.slots,
        [slotId]: { kind: 'ai', difficulty },
      },
    });
    this.renderDrawer();
  }

  public launchDraftMatch(): MatchSetupConfig {
    const launched = this.sceneManager.resetMatch(this.draftSetup);
    this.draftSetup = launched;
    this.outcomeBannerDismissed = false;
    this.lastOutcomeSig = '';
    this.closeLobby();
    this.syncTelemetry();
    this.onMatchLaunched?.(launched);
    return launched;
  }

  public launchTutorialMatch(): MatchSetupConfig {
    const launched = this.sceneManager.resetMatch('tutorial');
    this.draftSetup = launched;
    this.outcomeBannerDismissed = false;
    this.lastOutcomeSig = '';
    this.closeLobby();
    this.syncTelemetry();
    this.onMatchLaunched?.(launched);
    return launched;
  }

  private patchKothBanner(outcome: MatchOutcomeState): void {
    const koth = outcome.kingOfTheHill;
    if (!koth.enabled || koth.requiredSeconds === null) {
      this.kothBannerEl.style.display = 'none';
      return;
    }

    this.kothBannerEl.style.display = 'flex';
    const holderLabel = koth.controllerId
      ? FACTION_PALETTES[koth.controllerId].label
      : 'Unclaimed (Build Planetary Outpost on Nexus Super-Earth)';
    const holderHex = koth.controllerId
      ? `#${FACTION_PALETTES[koth.controllerId].tacticalHex.toString(16).padStart(6, '0')}`
      : '#94a3b8';
    const pct = Math.min(
      100,
      Math.round((koth.heldSeconds / Math.max(1, koth.requiredSeconds)) * 100),
    );
    const statusTag = !koth.controllerId
      ? 'NEUTRAL'
      : koth.isContested
        ? 'CONTESTED (PAUSED)'
        : 'HOLDING';

    this.kothBannerEl.innerHTML = `
      <div class="koth-banner-row">
        <div>
          <span class="hud-badge" style="background: rgba(245, 158, 11, 0.22); color: #fcd34d;">KING OF THE HILL • NEXUS SUPER-EARTH</span>
          <strong style="margin-left: 6px; color: ${holderHex};" data-hud-field="koth-holder">${holderLabel}</strong>
        </div>
        <div style="font-size: 0.72rem; color: ${koth.isContested ? '#f87171' : '#38bdf8'}; font-weight: 600;" data-hud-field="koth-timer">
          ${statusTag} • ${formatMatchClockSeconds(koth.heldSeconds)} / ${formatMatchClockSeconds(koth.requiredSeconds)} (${formatMatchClockSeconds(koth.remainingSeconds ?? koth.requiredSeconds)} left)
        </div>
      </div>
      <div class="telemetry-progress-bar" style="height: 6px;">
        <div class="telemetry-progress-fill ${koth.isContested ? 'ore' : 'crystal'}" style="width: ${pct}%;"></div>
      </div>
    `;
  }

  private patchOutcomeBanner(
    sim: GameSimulation,
    outcome: MatchOutcomeState,
  ): void {
    if (outcome.status === 'in_progress' || this.outcomeBannerDismissed) {
      this.outcomeBannerEl.style.display = 'none';
      return;
    }

    const sig = `${outcome.status}:${outcome.winnerId ?? 'none'}:${outcome.victoryCondition ?? 'none'}:${Math.round(outcome.finishedAtSeconds ?? sim.elapsedSeconds)}`;
    this.outcomeBannerEl.style.display = 'flex';
    if (sig === this.lastOutcomeSig) {
      return;
    }
    this.lastOutcomeSig = sig;

    const title =
      outcome.status === 'victory'
        ? 'VICTORY — SECTOR SUPREMACY ACHIEVED'
        : outcome.status === 'defeat'
          ? 'DEFEAT — COMMAND & CONTROL LOST'
          : 'DRAW — MUTUAL DESTRUCTION';
    const accentColor =
      outcome.status === 'victory'
        ? '#22c55e'
        : outcome.status === 'defeat'
          ? '#ef4444'
          : '#f59e0b';
    const winnerLabel = outcome.winnerId
      ? FACTION_PALETTES[outcome.winnerId].label
      : 'No Surviving Contender';
    const reasonLabel =
      outcome.victoryCondition === 'king_of_the_hill'
        ? 'Central Super-Earth King of the Hill (10:00 Continuous Hold)'
        : 'Last Command & Control Standing';
    const durationLabel = formatMatchClockSeconds(
      outcome.finishedAtSeconds ?? sim.elapsedSeconds,
    );

    this.outcomeBannerEl.style.borderColor = accentColor;
    this.outcomeBannerEl.innerHTML = `
      <div class="outcome-banner-header">
        <div>
          <div style="font-size: 0.86rem; font-weight: 700; letter-spacing: 0.06em; color: ${accentColor};" data-hud-field="outcome-title">
            ${title}
          </div>
          <div style="font-size: 0.74rem; color: #e2e8f0; margin-top: 3px;" data-hud-field="outcome-summary">
            Winner: <strong>${winnerLabel}</strong> • Condition: <strong>${reasonLabel}</strong> • Duration: <strong>${durationLabel}</strong>
          </div>
        </div>
        <div class="hud-btn-row">
          <button class="hud-btn active" data-action="open-lobby-from-outcome">
            Configure New Match
          </button>
          <button class="hud-btn" data-action="dismiss-outcome-banner">
            Continue Spectating
          </button>
        </div>
      </div>
    `;

    this.outcomeBannerEl
      .querySelector<HTMLButtonElement>(
        '[data-action="open-lobby-from-outcome"]',
      )
      ?.addEventListener('click', () => {
        this.openLobby();
      });

    this.outcomeBannerEl
      .querySelector<HTMLButtonElement>(
        '[data-action="dismiss-outcome-banner"]',
      )
      ?.addEventListener('click', () => {
        this.outcomeBannerDismissed = true;
        this.outcomeBannerEl.style.display = 'none';
      });
  }

  private patchLiveStandingsInDrawer(outcome: MatchOutcomeState): void {
    for (const slotId of PLAYER_SLOT_IDS) {
      const standing = outcome.standings.find((s) => s.playerId === slotId);
      const badgeEl = this.drawerEl.querySelector<HTMLElement>(
        `[data-lobby-standing="${slotId}"]`,
      );
      if (badgeEl) {
        const formatted = formatStandingBadge(standing);
        badgeEl.textContent = formatted.text;
        badgeEl.dataset.tone = formatted.tone;
      }
    }
  }

  private renderDrawer(): void {
    const sim = this.sceneManager.simAdapter.simulation;
    const activeSetup = sim.getMatchSetup();
    const outcome = sim.getMatchOutcome();

    const presetCardsHtml = MATCH_PRESET_IDS.map((presetId) => {
      const preset = MATCH_PRESETS[presetId];
      const isSelected = this.draftSetup.presetId === presetId;
      const isLive = activeSetup.presetId === presetId;
      const victoryRule =
        preset.centralSuperEarthKingOfTheHillSeconds !== null
          ? 'Last C&C Standing OR 10m Super-Earth King of the Hill'
          : 'Last Command & Control Standing';
      const fogRule =
        preset.fogOfWarMode === 'open_occupied_systems'
          ? 'Open System Visibility'
          : 'Sensor-Range Tactical Radar';

      return `
        <button
          type="button"
          class="lobby-preset-card ${isSelected ? 'selected' : ''}"
          data-lobby-preset="${preset.id}"
        >
          <div class="planet-card-title" style="justify-content: space-between;">
            <span>${preset.displayName}</span>
            <span class="hud-badge">${preset.targetDurationLabel}${isLive ? ' • LIVE' : ''}</span>
          </div>
          <div class="planet-card-meta">
            Start: <strong>${preset.startingOre} Ore / ${preset.startingCrystal} Crystal</strong> • Harvest: <strong>${preset.harvestRateMultiplier}x</strong> • Reserves: <strong>${preset.asteroidReserveMultiplier}x</strong>
          </div>
          <div class="planet-card-meta">
            Docks: <strong>${preset.cncMaxConcurrentDocks} C&C / ${preset.refineryMaxConcurrentDocks} Refinery</strong> • ${fogRule}
          </div>
          <div class="planet-card-meta" style="color: #7dd3fc;">
            Victory: ${victoryRule}
          </div>
        </button>
      `;
    }).join('');

    const slotRowsHtml = PLAYER_SLOT_IDS.map((slotId, index) => {
      const slotCfg = this.draftSetup.slots[slotId];
      const palette = FACTION_PALETTES[slotId];
      const hexColor = `#${palette.tacticalHex.toString(16).padStart(6, '0')}`;
      const standing = outcome.standings.find((s) => s.playerId === slotId);
      const standingInfo = formatStandingBadge(standing);
      const isLocalCommand = this.draftSetup.localPlayerId === slotId;

      const roleBtnsHtml = (['human', 'ai', 'empty'] as const)
        .map((role) => {
          const label =
            role === 'human'
              ? 'Human'
              : role === 'ai'
                ? 'AI Bot'
                : 'Empty';
          const active = slotCfg.kind === role;
          return `
            <button
              type="button"
              class="hud-btn ${active ? 'active' : ''}"
              data-lobby-slot="${slotId}"
              data-lobby-role="${role}"
            >
              ${label}
            </button>
          `;
        })
        .join('');

      const difficultyBtnsHtml =
        slotCfg.kind === 'ai'
          ? AI_DIFFICULTY_IDS.map((diffId) => {
              const prof = AI_DIFFICULTY_PROFILES[diffId];
              const active = slotCfg.difficulty === diffId;
              return `
                <button
                  type="button"
                  class="hud-btn ${active ? 'active' : ''}"
                  data-lobby-slot="${slotId}"
                  data-lobby-difficulty="${diffId}"
                  title="${prof.description}"
                >
                  ${prof.displayName.replace(' AI', '')}
                </button>
              `;
            }).join('')
          : `<span style="font-size: 0.7rem; color: #94a3b8;">${
              slotCfg.kind === 'human'
                ? 'Local Commander Slot (Direct HUD & Fleet Control)'
                : 'Unclaimed Starter Sector (10-Slot Homeworld Open for Colonization)'
            }</span>`;

      return `
        <div class="lobby-slot-row" data-lobby-slot-row="${slotId}">
          <div class="lobby-slot-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="lobby-faction-swatch" style="background: ${hexColor}; box-shadow: 0 0 8px ${hexColor};"></span>
              <strong>${palette.label}</strong>
              <span class="hud-badge">Starter System ${index + 1}</span>
              ${isLocalCommand ? '<span class="hud-badge" style="background: rgba(34, 197, 94, 0.2); color: #86efac;">YOU</span>' : ''}
            </div>
            <span class="lobby-standing-pill" data-lobby-standing="${slotId}" data-tone="${standingInfo.tone}">
              ${standingInfo.text}
            </span>
          </div>
          <div class="lobby-slot-controls">
            <div class="hud-btn-row" role="group" aria-label="${palette.label} Slot Role">
              ${roleBtnsHtml}
            </div>
            <div class="hud-btn-row" role="group" aria-label="${palette.label} AI Difficulty">
              ${difficultyBtnsHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const draftPreset = MATCH_PRESETS[this.draftSetup.presetId];
    const activeAIProfiles = PLAYER_SLOT_IDS.filter(
      (id) => this.draftSetup.slots[id].kind === 'ai',
    ).length;
    const emptySectors = PLAYER_SLOT_IDS.filter(
      (id) => this.draftSetup.slots[id].kind === 'empty',
    ).length;

    this.drawerEl.innerHTML = `
      <div class="lobby-drawer-header">
        <div>
          <div class="hud-label" style="margin-bottom: 2px;">PRE-MATCH LOBBY & AI OPPONENTS</div>
          <div style="font-size: 0.84rem; font-weight: 700; color: #f8fafc;">
            Configure Match Mode, Faction Slots & AI Difficulty
          </div>
        </div>
        <div class="hud-btn-row">
          <button type="button" class="hud-btn active" data-action="launch-tutorial">
            Start Guided Tutorial
          </button>
          <button type="button" class="hud-btn" data-action="close-lobby">
            Resume Current Match
          </button>
        </div>
      </div>

      <div>
        <div class="hud-label">1. Select Match Mode Preset</div>
        <div class="lobby-preset-grid">
          ${presetCardsHtml}
        </div>
      </div>

      <div>
        <div class="hud-label">2. Configure 4-Player Galaxy Slots (Human / AI Difficulty / Empty Colonizable Sector)</div>
        <div class="lobby-slots-list">
          ${slotRowsHtml}
        </div>
      </div>

      <div class="lobby-drawer-footer">
        <div style="font-size: 0.72rem; color: #cbd5e1;">
          Draft: <strong>${draftPreset.displayName}</strong> • Local Commander: <strong>${FACTION_PALETTES[this.draftSetup.localPlayerId].label}</strong> • AI Opponents: <strong>${activeAIProfiles}</strong> • Empty Colonizable Sectors: <strong>${emptySectors}</strong>
        </div>
        <div class="hud-btn-row">
          <button type="button" class="hud-btn" data-action="close-lobby">
            Cancel
          </button>
          <button type="button" class="hud-btn active" data-action="launch-match" style="font-weight: 700;">
            Launch New Match
          </button>
        </div>
      </div>
    `;

    this.drawerEl
      .querySelectorAll<HTMLButtonElement>('[data-lobby-preset]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const presetId = btn.dataset.lobbyPreset as MatchPresetId | undefined;
          if (presetId) {
            this.setDraftPreset(presetId);
          }
        });
      });

    this.drawerEl
      .querySelectorAll<HTMLButtonElement>('[data-lobby-role]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const slotId = btn.dataset.lobbySlot as PlayerSlotId | undefined;
          const role = btn.dataset.lobbyRole as
            | 'human'
            | 'ai'
            | 'empty'
            | undefined;
          if (slotId && role) {
            this.setDraftSlotRole(slotId, role);
          }
        });
      });

    this.drawerEl
      .querySelectorAll<HTMLButtonElement>('[data-lobby-difficulty]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          const slotId = btn.dataset.lobbySlot as PlayerSlotId | undefined;
          const diff = btn.dataset.lobbyDifficulty as
            | AIDifficultyId
            | undefined;
          if (slotId && diff) {
            this.setDraftSlotDifficulty(slotId, diff);
          }
        });
      });

    this.drawerEl
      .querySelector<HTMLButtonElement>('[data-action="launch-tutorial"]')
      ?.addEventListener('click', () => {
        this.launchTutorialMatch();
      });

    this.drawerEl
      .querySelectorAll<HTMLButtonElement>('[data-action="close-lobby"]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          this.closeLobby();
        });
      });

    this.drawerEl
      .querySelector<HTMLButtonElement>('[data-action="launch-match"]')
      ?.addEventListener('click', () => {
        this.launchDraftMatch();
      });
  }
}

