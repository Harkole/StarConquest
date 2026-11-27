import type { PlayerSlotId } from '../../shared/protocol/commands.ts';
import { BATTLE_SIMULATOR_SYSTEM_ID } from '../../shared/sim/gameSimulation.ts';
import type { SimulationView } from '../../shared/sim/simulationView.ts';
import { formatMatchClockSeconds } from './lobbyController.ts';

export type MatchStatusTone =
  | 'victory'
  | 'defeat'
  | 'koth'
  | 'koth_contested'
  | 'contenders';

export interface TopBarModel {
  readonly ore: number;
  readonly crystal: number;
  readonly supplyUsed: number;
  readonly supplyCap: number;
  readonly harvesters: number;
  readonly systemName: string;
  readonly yieldLabel: string;
  readonly matchClock: string;
  readonly matchStatus: { readonly label: string; readonly tone: MatchStatusTone };
  readonly speed: number;
  readonly musicMuted: boolean;
}

export interface TopBarActions {
  readonly onSetSpeed: (speed: number) => void;
  readonly onToggleMusic: () => void;
  readonly onQuitToMainMenu?: () => void;
}

const MATCH_STATUS_TONE_COLORS: Record<MatchStatusTone, string> = {
  victory: '#22c55e',
  defeat: '#ef4444',
  koth_contested: '#f87171',
  koth: '#fcd34d',
  contenders: '#7dd3fc',
};

const SPEAKER_UNMUTED_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;

const SPEAKER_MUTED_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;

export function buildTopBarModel(
  sim: SimulationView,
  params: {
    readonly playerId: PlayerSlotId;
    readonly activeSystemId: string;
    readonly speed: number;
    readonly musicMuted: boolean;
  },
): TopBarModel {
  const { playerId, activeSystemId, speed, musicMuted } = params;
  const pState = sim.getPlayerState(playerId);
  const harvesters = sim.galaxy.systems
    .flatMap((s) => sim.getPlayerSystemView(playerId, s.id).harvesters)
    .filter((h) => h.ownerId === playerId).length;

  const activeSysNode = sim.galaxy.systems.find((s) => s.id === activeSystemId);
  const systemName =
    activeSysNode?.name ??
    (activeSystemId === BATTLE_SIMULATOR_SYSTEM_ID
      ? 'Void Battle Simulator'
      : activeSystemId);

  const sysRes = sim.getPlayerSystemView(playerId, activeSystemId).resourceSummary;
  const yieldLabel = sysRes
    ? sysRes.extractionMultiplier > 1.0
      ? `${sysRes.extractionMultiplier}x Enriched Yield`
      : '1.0x Standard Yield'
    : 'Unscanned Sector';

  const outcome = sim.getMatchOutcome();
  const survivingCount =
    outcome.activeContenderIds.length - outcome.defeatedPlayerIds.length;

  let matchStatus: { readonly label: string; readonly tone: MatchStatusTone };
  if (outcome.status === 'victory') {
    matchStatus = { label: 'VICTORY', tone: 'victory' };
  } else if (outcome.status === 'defeat') {
    matchStatus = { label: 'DEFEAT', tone: 'defeat' };
  } else if (
    outcome.kingOfTheHill.enabled &&
    outcome.kingOfTheHill.controllerId &&
    outcome.kingOfTheHill.remainingSeconds !== null
  ) {
    matchStatus = {
      label: `KOTH ${formatMatchClockSeconds(outcome.kingOfTheHill.remainingSeconds)}`,
      tone: outcome.kingOfTheHill.isContested ? 'koth_contested' : 'koth',
    };
  } else {
    matchStatus = {
      label: `${survivingCount}/${outcome.activeContenderIds.length} C&C`,
      tone: 'contenders',
    };
  }

  return {
    ore: pState.ore,
    crystal: pState.crystal,
    supplyUsed: pState.supplyUsed,
    supplyCap: pState.supplyCap,
    harvesters,
    systemName,
    yieldLabel,
    matchClock: formatMatchClockSeconds(sim.elapsedSeconds),
    matchStatus,
    speed,
    musicMuted,
  };
}

export function mountTopBar(
  el: HTMLElement,
  actions: TopBarActions,
): { readonly update: (model: TopBarModel) => void } {
  el.innerHTML = `
    <div class="econ-metrics">
      <div class="econ-pill ore">
        <span class="econ-label">ORE</span>
        <strong id="econ-ore-val">0</strong>
      </div>
      <div class="econ-pill crystal">
        <span class="econ-label">CRYSTAL</span>
        <strong id="econ-crystal-val">0</strong>
      </div>
      <div class="econ-pill supply">
        <span class="econ-label">SUPPLY</span>
        <strong id="econ-supply-val">0 / 0</strong>
      </div>
      <div class="econ-pill harvesters">
        <span class="econ-label">HARVESTERS</span>
        <strong id="econ-harvesters-val">0</strong>
      </div>
      <div class="econ-pill top-bar-system" title="Active Star System">
        <span class="econ-label">SECTOR</span>
        <strong id="hud-top-system-name"></strong>
        <span class="top-bar-yield" id="hud-top-system-yield"></span>
      </div>
    </div>
    <div class="econ-actions">
      <div class="econ-pill" title="Elapsed Match Clock">
        <span class="econ-label">TIME</span>
        <strong id="hud-top-match-clock">00:00</strong>
      </div>
      <div class="econ-pill" id="hud-match-status-pill" title="Active Match Contenders & Victory Telemetry">
        <span class="econ-label">MATCH</span>
        <strong id="hud-match-status-val">4/4 C&amp;C</strong>
      </div>
      <button class="hud-btn" data-speed="1">1x</button>
      <button class="hud-btn" data-speed="2">2x</button>
      <button class="hud-btn" data-speed="4">4x</button>
      <button class="hud-btn" data-action="toggle-music" aria-label="Mute ambient music" title="Mute ambient music" style="display: inline-flex; align-items: center; justify-content: center; padding: 4px 8px;">
        ${SPEAKER_UNMUTED_SVG}
      </button>
      ${
        actions.onQuitToMainMenu
          ? `<button class="hud-btn" data-action="quit-to-main-menu" title="Return to Main Menu">Main Menu</button>`
          : ''
      }
    </div>
  `;

  const oreEl = el.querySelector<HTMLElement>('#econ-ore-val');
  const crystalEl = el.querySelector<HTMLElement>('#econ-crystal-val');
  const supplyEl = el.querySelector<HTMLElement>('#econ-supply-val');
  const harvestersEl = el.querySelector<HTMLElement>('#econ-harvesters-val');
  const systemNameEl = el.querySelector<HTMLElement>('#hud-top-system-name');
  const systemYieldEl = el.querySelector<HTMLElement>('#hud-top-system-yield');
  const matchClockEl = el.querySelector<HTMLElement>('#hud-top-match-clock');
  const matchStatusValEl = el.querySelector<HTMLElement>('#hud-match-status-val');
  const musicToggleBtnEl = el.querySelector<HTMLButtonElement>(
    '[data-action="toggle-music"]',
  );
  const quitBtnEl = el.querySelector<HTMLButtonElement>(
    '[data-action="quit-to-main-menu"]',
  );
  const speedBtnEls = Array.from(
    el.querySelectorAll<HTMLButtonElement>('[data-speed]'),
  );

  for (const btn of speedBtnEls) {
    btn.addEventListener('click', () => {
      actions.onSetSpeed(Number(btn.dataset.speed ?? '1'));
    });
  }

  musicToggleBtnEl?.addEventListener('click', () => {
    actions.onToggleMusic();
  });

  quitBtnEl?.addEventListener('click', () => {
    actions.onQuitToMainMenu?.();
  });

  let lastRenderedMusicMuted: boolean | null = null;

  return {
    update: (model: TopBarModel) => {
      if (oreEl) oreEl.textContent = `${model.ore}`;
      if (crystalEl) crystalEl.textContent = `${model.crystal}`;
      if (supplyEl) supplyEl.textContent = `${model.supplyUsed} / ${model.supplyCap}`;
      if (harvestersEl) harvestersEl.textContent = `${model.harvesters}`;
      if (systemNameEl) systemNameEl.textContent = model.systemName;
      if (systemYieldEl) systemYieldEl.textContent = model.yieldLabel;
      if (matchClockEl) matchClockEl.textContent = model.matchClock;
      if (matchStatusValEl) {
        matchStatusValEl.textContent = model.matchStatus.label;
        matchStatusValEl.style.color =
          MATCH_STATUS_TONE_COLORS[model.matchStatus.tone];
      }
      if (musicToggleBtnEl && model.musicMuted !== lastRenderedMusicMuted) {
        lastRenderedMusicMuted = model.musicMuted;
        musicToggleBtnEl.classList.toggle('active', !model.musicMuted);
        musicToggleBtnEl.innerHTML = model.musicMuted
          ? SPEAKER_MUTED_SVG
          : SPEAKER_UNMUTED_SVG;
        const label = model.musicMuted
          ? 'Unmute ambient music (restarts from beginning)'
          : 'Mute ambient music';
        musicToggleBtnEl.setAttribute('aria-label', label);
        musicToggleBtnEl.title = label;
      }
      for (const btn of speedBtnEls) {
        const spd = Number(btn.dataset.speed ?? '1');
        btn.classList.toggle('active', model.speed === spd);
      }
    },
  };
}
