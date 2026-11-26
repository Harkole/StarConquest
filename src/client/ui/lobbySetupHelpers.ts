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
  type PlayerSlotConfig,
} from '../../shared/config/index.ts';
import type { PlayerSlotId } from '../../shared/protocol/commands.ts';
import type { PlayerStandingSummary } from '../../shared/sim/gameSimulation.ts';
import type { WebRTCRoomState } from '../net/simAdapter.ts';
import { FACTION_PALETTES } from '../renderer/factionColors.ts';

export type PlayerSlotRole = 'human' | 'ai' | 'empty';

export const SETUP_PRESET_IDS: readonly MatchPresetId[] = [
  'blitz_skirmish',
  'standard_tactical',
  'grand_conquest',
] as const;

export const ALL_LOBBY_PRESET_IDS: readonly MatchPresetId[] = [
  'tutorial',
  'blitz_skirmish',
  'standard_tactical',
  'grand_conquest',
] as const;

const SLOT_ROLES: readonly PlayerSlotRole[] = ['human', 'ai', 'empty'] as const;

export function isMatchPresetId(value: string | undefined): value is MatchPresetId {
  return value !== undefined && Object.prototype.hasOwnProperty.call(MATCH_PRESETS, value);
}

export function isPlayerSlotId(value: string | undefined): value is PlayerSlotId {
  return value !== undefined && (PLAYER_SLOT_IDS as readonly string[]).includes(value);
}

export function isPlayerSlotRole(value: string | undefined): value is PlayerSlotRole {
  return value !== undefined && (SLOT_ROLES as readonly string[]).includes(value);
}

export function isAIDifficultyId(value: string | undefined): value is AIDifficultyId {
  return value !== undefined && (AI_DIFFICULTY_IDS as readonly string[]).includes(value);
}

export function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function formatStandingBadge(standing: PlayerStandingSummary | undefined): {
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

export function applyPresetSelection(
  draft: MatchSetupConfig,
  presetId: MatchPresetId,
): MatchSetupConfig {
  return normalizeMatchSetupConfig(
    presetId === 'tutorial'
      ? {
          presetId,
          localPlayerId: 'player_1',
          slots: getDefaultSlotsForPreset('tutorial'),
        }
      : {
          ...draft,
          presetId,
        },
  );
}

export function applySlotRoleChange(
  draft: MatchSetupConfig,
  slotId: PlayerSlotId,
  role: PlayerSlotRole,
  options?: { readonly keepHostLocal?: boolean },
): MatchSetupConfig {
  const currentSlot = draft.slots[slotId];
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
    ...draft.slots,
    [slotId]: nextSlot,
  };

  const hasActive = PLAYER_SLOT_IDS.some(
    (id) => nextSlots[id].kind !== 'empty',
  );
  if (!hasActive) {
    nextSlots[slotId] = { kind: 'human' };
  }

  const keepHostLocal =
    Boolean(options?.keepHostLocal) &&
    nextSlots[draft.localPlayerId].kind === 'human';
  const nextLocalPlayerId = keepHostLocal
    ? draft.localPlayerId
    : role === 'human'
      ? slotId
      : nextSlots[draft.localPlayerId].kind === 'human'
        ? draft.localPlayerId
        : (PLAYER_SLOT_IDS.find((id) => nextSlots[id].kind === 'human') ??
          PLAYER_SLOT_IDS.find((id) => nextSlots[id].kind !== 'empty') ??
          'player_1');

  return normalizeMatchSetupConfig({
    presetId: draft.presetId,
    localPlayerId: nextLocalPlayerId,
    slots: nextSlots,
  });
}

export function applySlotDifficultyChange(
  draft: MatchSetupConfig,
  slotId: PlayerSlotId,
  difficulty: AIDifficultyId,
): MatchSetupConfig {
  return normalizeMatchSetupConfig({
    presetId: draft.presetId,
    localPlayerId: draft.localPlayerId,
    slots: {
      ...draft.slots,
      [slotId]: { kind: 'ai', difficulty },
    },
  });
}

export interface RenderPresetCardsOptions {
  readonly presetIds: readonly MatchPresetId[];
  readonly activePresetId: MatchPresetId;
  readonly livePresetId?: MatchPresetId;
  readonly disabled?: boolean;
}

export function renderPresetCardsHtml(options: RenderPresetCardsOptions): string {
  const { presetIds, activePresetId, livePresetId, disabled = false } = options;
  const disabledAttr = disabled ? 'disabled' : '';

  return presetIds
    .map((presetId) => {
      const preset = MATCH_PRESETS[presetId];
      const isSelected = activePresetId === presetId;
      const isLive = livePresetId !== undefined && livePresetId === presetId;
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
          ${disabledAttr}
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
    })
    .join('');
}

export interface RenderSlotRowsOptions {
  readonly draftSetup: MatchSetupConfig;
  readonly roomState?: WebRTCRoomState | null;
  readonly disabled?: boolean;
  readonly standings?: readonly PlayerStandingSummary[];
}

export function renderSlotRowsHtml(options: RenderSlotRowsOptions): string {
  const { draftSetup, roomState = null, disabled = false, standings } = options;
  const isHostingP2P = Boolean(
    roomState && roomState.role === 'host' && roomState.status !== 'idle',
  );
  const isJoinedP2P = Boolean(
    roomState && roomState.role === 'client' && roomState.status !== 'idle',
  );
  const disabledAttr = disabled || isJoinedP2P ? 'disabled' : '';

  return PLAYER_SLOT_IDS.map((slotId, index) => {
    const peerSlotInfo = isJoinedP2P
      ? roomState?.slots.find((s) => s.slotId === slotId)
      : undefined;
    const slotCfg: PlayerSlotConfig = peerSlotInfo
      ? peerSlotInfo.kind === 'ai'
        ? { kind: 'ai', difficulty: peerSlotInfo.aiDifficulty ?? 'standard' }
        : { kind: peerSlotInfo.kind }
      : draftSetup.slots[slotId];
    const palette = FACTION_PALETTES[slotId];
    const hexColor = `#${palette.tacticalHex.toString(16).padStart(6, '0')}`;
    const isLocalCommand = isJoinedP2P
      ? roomState?.localPlayerId === slotId
      : draftSetup.localPlayerId === slotId;
    const localBadgeLabel = isJoinedP2P ? 'YOU (Remote)' : 'YOU';

    const standingHtml = standings
      ? (() => {
          const standing = standings.find((s) => s.playerId === slotId);
          const standingInfo = formatStandingBadge(standing);
          return `
            <span class="lobby-standing-pill" data-lobby-standing="${slotId}" data-tone="${standingInfo.tone}">
              ${standingInfo.text}
            </span>
          `;
        })()
      : '';

    const roleBtnsHtml = SLOT_ROLES.map((role) => {
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
          ${disabledAttr}
        >
          ${label}
        </button>
      `;
    }).join('');

    let detailHtml: string;
    if (slotCfg.kind === 'ai') {
      detailHtml = AI_DIFFICULTY_IDS.map((diffId) => {
        const prof = AI_DIFFICULTY_PROFILES[diffId];
        const active = slotCfg.difficulty === diffId;
        return `
          <button
            type="button"
            class="hud-btn ${active ? 'active' : ''}"
            data-lobby-slot="${slotId}"
            data-lobby-difficulty="${diffId}"
            title="${prof.description}"
            ${disabledAttr}
          >
            ${prof.displayName.replace(' AI', '')}
          </button>
        `;
      }).join('');
    } else if (slotCfg.kind === 'empty') {
      detailHtml =
        '<span style="font-size: 0.7rem; color: #94a3b8;">Unclaimed Starter Sector (10-Slot Homeworld Open for Colonization)</span>';
    } else if (isHostingP2P && roomState) {
      if (slotId === roomState.localPlayerId) {
        detailHtml =
          '<span style="font-size: 0.7rem; color: #86efac;">Host (Local Commander)</span>';
      } else {
        const assignedPeer = roomState.peers.find(
          (p) => p.assignedSlotId === slotId,
        );
        const assignBtns = roomState.peers
          .filter((p) => p.connected && p.assignedSlotId !== slotId)
          .map(
            (p) => `
              <button
                type="button"
                class="hud-btn"
                data-p2p-assign-slot="${slotId}"
                data-p2p-peer-id="${escapeHtmlAttribute(p.peerId)}"
              >
                Assign ${p.label}
              </button>
            `,
          )
          .join('');
        const assignedHtml = assignedPeer
          ? `<span style="font-size: 0.7rem; color: #7dd3fc;">Remote Human: <strong>${assignedPeer.label}</strong></span>
             <button type="button" class="hud-btn" data-p2p-unassign-slot="${slotId}">Unassign</button>`
          : '<span style="font-size: 0.7rem; color: #94a3b8;">Remote Human • Open Remote Slot</span>';
        detailHtml = `${assignedHtml}${assignBtns}`;
      }
    } else if (isJoinedP2P) {
      const remoteLabel = peerSlotInfo?.peerId
        ? `Remote Human (${peerSlotInfo.peerId})`
        : slotId === roomState?.localPlayerId
          ? 'Remote Human (You)'
          : 'Host / Remote Commander';
      detailHtml = `<span style="font-size: 0.7rem; color: #94a3b8;">${remoteLabel}</span>`;
    } else {
      detailHtml =
        '<span style="font-size: 0.7rem; color: #94a3b8;">Local Commander Slot (Direct HUD & Fleet Control)</span>';
    }

    return `
      <div class="lobby-slot-row" data-lobby-slot-row="${slotId}">
        <div class="lobby-slot-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="lobby-faction-swatch" style="background: ${hexColor}; box-shadow: 0 0 8px ${hexColor};"></span>
            <strong>${palette.label}</strong>
            <span class="hud-badge">Starter System ${index + 1}</span>
            ${isLocalCommand ? `<span class="hud-badge" style="background: rgba(34, 197, 94, 0.2); color: #86efac;">${localBadgeLabel}</span>` : ''}
          </div>
          ${standingHtml}
        </div>
        <div class="lobby-slot-controls">
          <div class="hud-btn-row" role="group" aria-label="${palette.label} Slot Role">
            ${roleBtnsHtml}
          </div>
          <div class="hud-btn-row" role="group" aria-label="${palette.label} AI Difficulty">
            ${detailHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}
