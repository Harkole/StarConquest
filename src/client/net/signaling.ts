import { PLAYER_SLOT_IDS } from '../../shared/config/index.ts';
import type { PlayerSlotId } from '../../shared/protocol/commands.ts';

export const P2P_SIGNALING_CHANNEL_NAME = 'starconquest-p2p-signaling';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_PREFIX = 'SC-';

export type RoomSignalEnvelope =
  | {
      readonly kind: 'join_request';
      readonly roomCode: string;
      readonly fromPeerId: string;
      readonly requestedSlotId?: PlayerSlotId;
    }
  | {
      readonly kind: 'offer';
      readonly roomCode: string;
      readonly fromPeerId: string;
      readonly toPeerId: string;
      readonly sdp: RTCSessionDescriptionInit;
    }
  | {
      readonly kind: 'answer';
      readonly roomCode: string;
      readonly fromPeerId: string;
      readonly toPeerId: string;
      readonly sdp: RTCSessionDescriptionInit;
    }
  | {
      readonly kind: 'ice';
      readonly roomCode: string;
      readonly fromPeerId: string;
      readonly toPeerId: string;
      readonly candidate: RTCIceCandidateInit;
    }
  | {
      readonly kind: 'room_closed';
      readonly roomCode: string;
      readonly fromPeerId: string;
      readonly reason?: string;
    };

export interface RoomSignalingTransport {
  send(signal: RoomSignalEnvelope): void;
  subscribe(
    roomCode: string,
    handler: (signal: RoomSignalEnvelope) => void,
  ): () => void;
  close(): void;
}

export interface ManualSignalPayload {
  readonly version: 1;
  readonly kind: 'offer' | 'answer';
  readonly roomCode: string;
  readonly fromPeerId: string;
  readonly toPeerId?: string;
  readonly sdp: RTCSessionDescriptionInit;
  readonly iceCandidates: readonly RTCIceCandidateInit[];
  readonly assignedSlotId?: PlayerSlotId;
}

export function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}

export function generateRoomCode(
  randomFn: () => number = Math.random,
): string {
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(randomFn() * ROOM_CODE_ALPHABET.length) % ROOM_CODE_ALPHABET.length;
    suffix += ROOM_CODE_ALPHABET[idx] ?? 'A';
  }
  return `${ROOM_CODE_PREFIX}${suffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPlayerSlotId(value: unknown): value is PlayerSlotId {
  return (
    typeof value === 'string' &&
    (PLAYER_SLOT_IDS as readonly string[]).includes(value)
  );
}

function isSessionDescriptionInit(
  value: unknown,
): value is RTCSessionDescriptionInit {
  if (!isRecord(value)) {
    return false;
  }
  const validType =
    value.type === 'offer' ||
    value.type === 'answer' ||
    value.type === 'pranswer' ||
    value.type === 'rollback';
  return validType && (value.sdp === undefined || typeof value.sdp === 'string');
}

function isIceCandidateInit(value: unknown): value is RTCIceCandidateInit {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.candidate === undefined || typeof value.candidate === 'string') &&
    (value.sdpMid === undefined ||
      value.sdpMid === null ||
      typeof value.sdpMid === 'string') &&
    (value.sdpMLineIndex === undefined ||
      value.sdpMLineIndex === null ||
      typeof value.sdpMLineIndex === 'number')
  );
}

export function parseRoomSignalEnvelope(
  raw: unknown,
): RoomSignalEnvelope | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (!isNonEmptyString(raw.roomCode) || !isNonEmptyString(raw.fromPeerId)) {
    return null;
  }
  const roomCode = normalizeRoomCode(raw.roomCode);

  switch (raw.kind) {
    case 'join_request':
      if (
        raw.requestedSlotId !== undefined &&
        !isPlayerSlotId(raw.requestedSlotId)
      ) {
        return null;
      }
      return {
        kind: 'join_request',
        roomCode,
        fromPeerId: raw.fromPeerId,
        ...(raw.requestedSlotId !== undefined
          ? { requestedSlotId: raw.requestedSlotId }
          : {}),
      };

    case 'offer':
    case 'answer':
      if (!isNonEmptyString(raw.toPeerId) || !isSessionDescriptionInit(raw.sdp)) {
        return null;
      }
      return {
        kind: raw.kind,
        roomCode,
        fromPeerId: raw.fromPeerId,
        toPeerId: raw.toPeerId,
        sdp: raw.sdp,
      };

    case 'ice':
      if (!isNonEmptyString(raw.toPeerId) || !isIceCandidateInit(raw.candidate)) {
        return null;
      }
      return {
        kind: 'ice',
        roomCode,
        fromPeerId: raw.fromPeerId,
        toPeerId: raw.toPeerId,
        candidate: raw.candidate,
      };

    case 'room_closed':
      if (raw.reason !== undefined && typeof raw.reason !== 'string') {
        return null;
      }
      return {
        kind: 'room_closed',
        roomCode,
        fromPeerId: raw.fromPeerId,
        ...(raw.reason !== undefined ? { reason: raw.reason } : {}),
      };

    default:
      return null;
  }
}

export class BroadcastChannelSignalingTransport implements RoomSignalingTransport {
  private readonly channel: BroadcastChannel | null;
  private readonly listenersByRoom = new Map<
    string,
    Set<(signal: RoomSignalEnvelope) => void>
  >();

  constructor(channelName: string = P2P_SIGNALING_CHANNEL_NAME) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(channelName);
      this.channel.onmessage = (event: MessageEvent<unknown>) => {
        const parsed = parseRoomSignalEnvelope(event.data);
        if (!parsed) {
          return;
        }
        const handlers = this.listenersByRoom.get(parsed.roomCode);
        if (!handlers) {
          return;
        }
        for (const handler of [...handlers]) {
          handler(parsed);
        }
      };
    } else {
      this.channel = null;
    }
  }

  public send(signal: RoomSignalEnvelope): void {
    if (!this.channel) {
      return;
    }
    this.channel.postMessage({
      ...signal,
      roomCode: normalizeRoomCode(signal.roomCode),
    });
  }

  public subscribe(
    roomCode: string,
    handler: (signal: RoomSignalEnvelope) => void,
  ): () => void {
    const normalized = normalizeRoomCode(roomCode);
    let set = this.listenersByRoom.get(normalized);
    if (!set) {
      set = new Set();
      this.listenersByRoom.set(normalized, set);
    }
    set.add(handler);
    return () => {
      const current = this.listenersByRoom.get(normalized);
      if (!current) {
        return;
      }
      current.delete(handler);
      if (current.size === 0) {
        this.listenersByRoom.delete(normalized);
      }
    };
  }

  public close(): void {
    this.listenersByRoom.clear();
    if (this.channel) {
      this.channel.close();
    }
  }
}

export class InMemorySignalingHub {
  private readonly listenersByRoom = new Map<
    string,
    Set<(signal: RoomSignalEnvelope) => void>
  >();

  public dispatch(signal: RoomSignalEnvelope): void {
    const normalized: RoomSignalEnvelope = {
      ...signal,
      roomCode: normalizeRoomCode(signal.roomCode),
    };
    const set = this.listenersByRoom.get(normalized.roomCode);
    if (!set) {
      return;
    }
    for (const handler of [...set]) {
      handler(normalized);
    }
  }

  public addListener(
    roomCode: string,
    handler: (signal: RoomSignalEnvelope) => void,
  ): () => void {
    const normalized = normalizeRoomCode(roomCode);
    let set = this.listenersByRoom.get(normalized);
    if (!set) {
      set = new Set();
      this.listenersByRoom.set(normalized, set);
    }
    set.add(handler);
    return () => {
      const current = this.listenersByRoom.get(normalized);
      if (!current) {
        return;
      }
      current.delete(handler);
      if (current.size === 0) {
        this.listenersByRoom.delete(normalized);
      }
    };
  }
}

export function createInMemorySignalingTransport(
  hub: InMemorySignalingHub = new InMemorySignalingHub(),
): RoomSignalingTransport {
  const unsubscribers = new Set<() => void>();
  return {
    send(signal: RoomSignalEnvelope): void {
      hub.dispatch(signal);
    },
    subscribe(
      roomCode: string,
      handler: (signal: RoomSignalEnvelope) => void,
    ): () => void {
      const unsub = hub.addListener(roomCode, handler);
      unsubscribers.add(unsub);
      return () => {
        unsubscribers.delete(unsub);
        unsub();
      };
    },
    close(): void {
      for (const unsub of [...unsubscribers]) {
        unsub();
      }
      unsubscribers.clear();
    },
  };
}

function encodeBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(token: string): string | null {
  try {
    const padded = token.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const binary = atob(padded + '='.repeat(padLen));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodeManualSignalToken(payload: ManualSignalPayload): string {
  return encodeBase64Url(
    JSON.stringify({
      ...payload,
      roomCode: normalizeRoomCode(payload.roomCode),
    }),
  );
}

export function decodeManualSignalToken(
  token: string,
): ManualSignalPayload | null {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const decoded = decodeBase64Url(trimmed);
  if (!decoded) {
    return null;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(decoded);
  } catch {
    return null;
  }
  if (!isRecord(raw)) {
    return null;
  }
  if (
    raw.version !== 1 ||
    (raw.kind !== 'offer' && raw.kind !== 'answer') ||
    !isNonEmptyString(raw.roomCode) ||
    !isNonEmptyString(raw.fromPeerId) ||
    !isSessionDescriptionInit(raw.sdp) ||
    !Array.isArray(raw.iceCandidates) ||
    !raw.iceCandidates.every(isIceCandidateInit)
  ) {
    return null;
  }
  if (raw.toPeerId !== undefined && !isNonEmptyString(raw.toPeerId)) {
    return null;
  }
  if (raw.assignedSlotId !== undefined && !isPlayerSlotId(raw.assignedSlotId)) {
    return null;
  }

  return {
    version: 1,
    kind: raw.kind,
    roomCode: normalizeRoomCode(raw.roomCode),
    fromPeerId: raw.fromPeerId,
    ...(raw.toPeerId !== undefined ? { toPeerId: raw.toPeerId } : {}),
    sdp: raw.sdp,
    iceCandidates: raw.iceCandidates,
    ...(raw.assignedSlotId !== undefined
      ? { assignedSlotId: raw.assignedSlotId }
      : {}),
  };
}
