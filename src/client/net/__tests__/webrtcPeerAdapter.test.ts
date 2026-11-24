import { describe, expect, it } from 'vitest';
import {
  InMemorySignalingHub,
  createInMemorySignalingTransport,
  decodeManualSignalToken,
  encodeManualSignalToken,
  generateRoomCode,
} from '../signaling.ts';
import {
  P2P_DATA_CHANNEL_LABEL,
  WebRTCPeerAdapter,
  type DataChannelLike,
  type PeerConnectionFactory,
  type PeerConnectionLike,
} from '../webrtcPeerAdapter.ts';

class FakeDataChannel implements DataChannelLike {
  public readonly label: string;
  public readyState: RTCDataChannelState = 'connecting';
  public onopen: (() => void) | null = null;
  public onclose: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  public peer: FakeDataChannel | null = null;
  public readonly sentMessages: string[] = [];

  constructor(label: string) {
    this.label = label;
  }

  public open(): void {
    if (this.readyState === 'open') {
      return;
    }
    this.readyState = 'open';
    this.onopen?.();
  }

  public send(data: string): void {
    if (this.readyState !== 'open') {
      throw new Error('FakeDataChannel is not open');
    }
    this.sentMessages.push(data);
    const peer = this.peer;
    if (peer && peer.readyState === 'open') {
      peer.onmessage?.({ data });
    }
  }

  public close(): void {
    if (this.readyState === 'closed') {
      return;
    }
    this.readyState = 'closed';
    this.onclose?.();
    if (this.peer && this.peer.readyState !== 'closed') {
      this.peer.close();
    }
  }
}

class FakePeerConnectionRegistry {
  private counter = 0;
  private readonly pcs = new Map<string, FakePeerConnection>();

  public createFactory(): PeerConnectionFactory {
    return () => {
      this.counter += 1;
      const id = `pc-${this.counter}`;
      const pc = new FakePeerConnection(id, this);
      this.pcs.set(id, pc);
      return pc;
    };
  }

  public get(id: string): FakePeerConnection | undefined {
    return this.pcs.get(id);
  }
}

class FakePeerConnection implements PeerConnectionLike {
  public readonly id: string;
  private readonly registry: FakePeerConnectionRegistry;

  public onicecandidate:
    | ((event: { readonly candidate: RTCIceCandidateInit | null }) => void)
    | null = null;
  public ondatachannel:
    | ((event: { readonly channel: DataChannelLike }) => void)
    | null = null;
  public onconnectionstatechange: (() => void) | null = null;

  public remotePc: FakePeerConnection | null = null;
  public readonly localChannels: FakeDataChannel[] = [];
  public lastCreatedChannel: FakeDataChannel | null = null;
  private channelsPaired = false;

  constructor(id: string, registry: FakePeerConnectionRegistry) {
    this.id = id;
    this.registry = registry;
  }

  public createDataChannel(label: string): DataChannelLike {
    const ch = new FakeDataChannel(label);
    this.localChannels.push(ch);
    this.lastCreatedChannel = ch;
    return ch;
  }

  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: `fake-offer:${this.id}` };
  }

  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: `fake-answer:${this.id}` };
  }

  public async setLocalDescription(): Promise<void> {
    this.onicecandidate?.({
      candidate: { candidate: `candidate:${this.id}`, sdpMid: '0', sdpMLineIndex: 0 },
    });
  }

  public async setRemoteDescription(
    desc: RTCSessionDescriptionInit,
  ): Promise<void> {
    const sdp = desc.sdp ?? '';
    const colonIdx = sdp.indexOf(':');
    if (colonIdx !== -1) {
      const remoteId = sdp.slice(colonIdx + 1);
      const remote = this.registry.get(remoteId);
      if (remote) {
        this.remotePc = remote;
        remote.remotePc = this;
        if (desc.type === 'answer') {
          this.pairDataChannelsWith(remote);
        }
      }
    }
  }

  public async addIceCandidate(): Promise<void> {
    // No-op in deterministic fake
  }

  public close(): void {
    for (const ch of this.localChannels) {
      ch.close();
    }
  }

  private pairDataChannelsWith(remote: FakePeerConnection): void {
    if (this.channelsPaired) {
      return;
    }
    this.channelsPaired = true;
    for (const hostCh of this.localChannels) {
      const peerCh = new FakeDataChannel(hostCh.label);
      hostCh.peer = peerCh;
      peerCh.peer = hostCh;
      remote.localChannels.push(peerCh);
      remote.lastCreatedChannel = peerCh;
      remote.ondatachannel?.({ channel: peerCh });
      hostCh.open();
      peerCh.open();
    }
  }
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

describe('WebRTCPeerAdapter', () => {
  it('connects host + 3 remote peers via room code, assigns slots, and launches match', async () => {
    const hub = new InMemorySignalingHub();
    const pcRegistry = new FakePeerConnectionRegistry();
    const factory = pcRegistry.createFactory();

    const host = new WebRTCPeerAdapter({
      localPeerId: 'host-1',
      signalingTransport: createInMemorySignalingTransport(hub),
      peerConnectionFactory: factory,
      snapshotIntervalSeconds: 0.05,
    });

    const roomCode = generateRoomCode();
    expect(roomCode).toMatch(/^SC-[A-HJ-NP-Z2-9]{4}$/);

    host.hostRoom({
      roomCode,
      presetOrSetup: 'standard_tactical',
    });

    const peer2 = new WebRTCPeerAdapter({
      localPeerId: 'peer-2',
      signalingTransport: createInMemorySignalingTransport(hub),
      peerConnectionFactory: factory,
    });
    const peer3 = new WebRTCPeerAdapter({
      localPeerId: 'peer-3',
      signalingTransport: createInMemorySignalingTransport(hub),
      peerConnectionFactory: factory,
    });
    const peer4 = new WebRTCPeerAdapter({
      localPeerId: 'peer-4',
      signalingTransport: createInMemorySignalingTransport(hub),
      peerConnectionFactory: factory,
    });
    const peer5 = new WebRTCPeerAdapter({
      localPeerId: 'peer-5',
      signalingTransport: createInMemorySignalingTransport(hub),
      peerConnectionFactory: factory,
    });

    await peer2.joinRoom(roomCode);
    await peer3.joinRoom(roomCode);
    await peer4.joinRoom(roomCode);
    await peer5.joinRoom(roomCode);
    await flushMicrotasks();

    expect(host.getRoomState().peers).toHaveLength(3);
    expect(peer5.getRoomState().status).toBe('joining');

    expect(host.assignPeerToSlot('peer-2', 'player_2')).toBe(true);
    expect(host.assignPeerToSlot('peer-3', 'player_3')).toBe(true);
    expect(host.assignPeerToSlot('peer-4', 'player_4')).toBe(true);
    expect(host.assignPeerToSlot('peer-2', 'player_1')).toBe(false);

    const setup = host.launchMatch();
    expect(setup.slots.player_2.kind).toBe('human');
    expect(setup.slots.player_3.kind).toBe('human');
    expect(setup.slots.player_4.kind).toBe('human');

    expect(host.mode).toBe('p2p_host');
    expect(peer2.mode).toBe('p2p_client');
    expect(peer2.getRoomState().status).toBe('in_match');
    expect(peer2.localPlayerId).toBe('player_2');
    expect(peer3.localPlayerId).toBe('player_3');
    expect(peer4.localPlayerId).toBe('player_4');
  });

  it('isolates Fog-of-War StateSnapshots per player and routes/anti-spoofs commands', async () => {
    const hub = new InMemorySignalingHub();
    const pcRegistry = new FakePeerConnectionRegistry();
    const factory = pcRegistry.createFactory();

    const host = new WebRTCPeerAdapter({
      localPeerId: 'host-1',
      signalingTransport: createInMemorySignalingTransport(hub),
      peerConnectionFactory: factory,
      snapshotIntervalSeconds: 0.05,
    });
    host.hostRoom({
      roomCode: 'SC-TEST',
      presetOrSetup: 'standard_tactical',
    });

    const peer2 = new WebRTCPeerAdapter({
      localPeerId: 'peer-2',
      signalingTransport: createInMemorySignalingTransport(hub),
      peerConnectionFactory: factory,
    });
    await peer2.joinRoom('SC-TEST');
    await flushMicrotasks();

    host.assignPeerToSlot('peer-2', 'player_2');
    host.launchMatch();

    // Fog of War isolation: player_2 cannot read player_1 economy and cannot see player_1's home system
    expect(() => peer2.simulation.getPlayerState('player_1')).toThrow();
    const p2Econ = peer2.simulation.getPlayerState('player_2');
    expect(p2Econ.playerId).toBe('player_2');

    const p1SystemFromP2 = peer2.simulation.getPlayerSystemView(
      'player_2',
      'system_starter_1',
    );
    expect(p1SystemFromP2.fogMode).toBe('sensor_range');
    expect(p1SystemFromP2.isExplored).toBe(false);
    expect(p1SystemFromP2.harvesters).toHaveLength(0);

    // Command routing: peer2 submits CREATE_FLEET for player_2
    const initialP2Fleets = peer2.simulation.getFleetsForPlayer('player_2').length;
    const cmdRes = peer2.submitPlayerCommand({
      type: 'CREATE_FLEET',
      playerId: 'player_2',
      name: 'Vanguard',
      rallySystemId: 'system_starter_2',
      rallyPosition: { x: 80, z: -40 },
    });
    expect(cmdRes.ok).toBe(true);

    // Step host past snapshotIntervalSeconds so StateSnapshot reaches peer2
    host.update(0.06);
    expect(peer2.simulation.getFleetsForPlayer('player_2').length).toBe(
      initialP2Fleets + 1,
    );

    // Anti-spoofing: inject a spoofed player_command with playerId: 'player_1' on peer2's channel
    const hostFleetsBeforeSpoof = host
      .getHostSimulation()!
      .getFleetsForPlayer('player_1').length;
    const peer2Pc = pcRegistry.get('pc-2')!;
    const peer2Channel = peer2Pc.lastCreatedChannel!;
    expect(peer2Channel.label).toBe(P2P_DATA_CHANNEL_LABEL);
    peer2Channel.send(
      JSON.stringify({
        kind: 'player_command',
        commandId: 'spoof-1',
        command: {
          type: 'CREATE_FLEET',
          playerId: 'player_1',
          name: 'Spoofed',
          rallySystemId: 'system_starter_1',
          rallyPosition: { x: 0, z: 0 },
        },
      }),
    );

    const hostFleetsAfterSpoof = host
      .getHostSimulation()!
      .getFleetsForPlayer('player_1').length;
    expect(hostFleetsAfterSpoof).toBe(hostFleetsBeforeSpoof);
    expect(peer2.getRoomState().lastError).toContain('does not match assigned peer slot');

    // leaveRoom() cleans up and rejects further commands
    peer2.leaveRoom();
    expect(peer2.getRoomState().status).toBe('idle');
    const afterLeave = peer2.submitPlayerCommand({
      type: 'CREATE_FLEET',
      playerId: 'player_2',
      rallySystemId: 'system_starter_2',
      rallyPosition: { x: 0, z: 0 },
    });
    expect(afterLeave.ok).toBe(false);
    expect(afterLeave.reason).toBe('Not connected to host');
  });

  it('supports manual signal token encoding/decoding and copy-paste handshake', async () => {
    const pcRegistry = new FakePeerConnectionRegistry();
    const factory = pcRegistry.createFactory();

    const host = new WebRTCPeerAdapter({
      localPeerId: 'host-manual',
      signalingTransport: createInMemorySignalingTransport(),
      peerConnectionFactory: factory,
    });
    host.hostRoom({ roomCode: 'SC-MAN1', presetOrSetup: 'blitz_skirmish' });

    const client = new WebRTCPeerAdapter({
      localPeerId: 'client-manual',
      signalingTransport: createInMemorySignalingTransport(),
      peerConnectionFactory: factory,
    });

    const inviteToken = await host.createManualInviteToken('player_2');
    const decodedInvite = decodeManualSignalToken(inviteToken);
    expect(decodedInvite?.kind).toBe('offer');
    expect(decodedInvite?.roomCode).toBe('SC-MAN1');

    const answerToken = await client.acceptManualInviteToken(inviteToken);
    await host.applyManualAnswerToken(answerToken);
    await flushMicrotasks();

    expect(client.getRoomState().status).toBe('connected');
    host.launchMatch();
    expect(client.getRoomState().status).toBe('in_match');
    expect(client.localPlayerId).toBe('player_2');

    // Invalid token returns null safely
    expect(decodeManualSignalToken('not-valid-base64!!!')).toBeNull();
    expect(
      decodeManualSignalToken(
        encodeManualSignalToken({
          version: 1,
          kind: 'offer',
          roomCode: 'SC-MAN1',
          fromPeerId: 'a',
          sdp: { type: 'offer', sdp: 'v=0' },
          iceCandidates: [],
        }),
      )?.roomCode,
    ).toBe('SC-MAN1');
  });
});
