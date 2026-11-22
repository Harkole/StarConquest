import { describe, expect, it } from 'vitest';
import {
  AmbientMusicPlayer,
  MUSIC_TRACKS,
  resolveAudioTrackUrl,
  type AudioElementLike,
} from '../ambientMusicPlayer.ts';

class MockAudioElement implements AudioElementLike {
  public src: string;
  public loop = false;
  public volume = 1;
  public currentTime = 0;
  public paused = true;
  public playCalls = 0;
  public pauseCalls = 0;
  public rejectRemainingPlays = 0;
  private readonly listeners = new Map<string, Set<() => void>>();

  public constructor(src: string) {
    this.src = src;
  }

  public play(): Promise<void> {
    this.playCalls += 1;
    if (this.rejectRemainingPlays > 0) {
      this.rejectRemainingPlays -= 1;
      this.paused = true;
      return Promise.reject(new Error('Autoplay blocked'));
    }
    this.paused = false;
    return Promise.resolve();
  }

  public pause(): void {
    this.pauseCalls += 1;
    this.paused = true;
  }

  public addEventListener(type: string, listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  public removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  public emitEnded(): void {
    for (const fn of this.listeners.get('ended') ?? []) {
      fn();
    }
  }
}

describe('AmbientMusicPlayer', () => {
  it('resolves audio track URLs against BASE_URL with trailing slash normalization', () => {
    expect(resolveAudioTrackUrl('The_View_from_Perigee.mp3', '/')).toBe(
      '/audio/The_View_from_Perigee.mp3',
    );
    expect(resolveAudioTrackUrl('The_View_from_Perigee.mp3', '/StarConquest/')).toBe(
      '/StarConquest/audio/The_View_from_Perigee.mp3',
    );
    expect(resolveAudioTrackUrl('The_View_from_Perigee.mp3', '/StarConquest')).toBe(
      '/StarConquest/audio/The_View_from_Perigee.mp3',
    );
  });

  it('shuffles all 4 ambient tracks on load, plays every track once, and loops the shuffled order', () => {
    let created: MockAudioElement | null = null;
    // Deterministic RNG sequence so Fisher-Yates produces a known non-identity shuffle
    const rngValues = [0.1, 0.7, 0.2];
    let rngIdx = 0;
    const player = new AmbientMusicPlayer({
      baseUrl: '/StarConquest/',
      random: () => rngValues[rngIdx++ % rngValues.length]!,
      createAudio: (src) => {
        created = new MockAudioElement(src);
        return created;
      },
    });

    const ambientTracks = MUSIC_TRACKS.filter((t) => t.category === 'ambient');
    expect(ambientTracks).toHaveLength(4);
    expect(player.getPlaylist()).toHaveLength(4);
    expect(created!.loop).toBe(false);

    const expectedOrder = player.getPlaylist().map((t) => t.id);
    // Every ambient track appears exactly once
    expect(new Set(expectedOrder).size).toBe(4);

    player.start();
    const playedIds: string[] = [player.getTrack().id];
    expect(created!.src).toBe(`/StarConquest/audio/${player.getTrack().filename}`);
    expect(created!.paused).toBe(false);

    // Advance through tracks 2, 3, 4, then verify it loops back to track 1
    for (let i = 0; i < 4; i++) {
      created!.emitEnded();
      playedIds.push(player.getTrack().id);
    }

    expect(playedIds.slice(0, 4)).toEqual(expectedOrder);
    expect(playedIds[4]).toBe(expectedOrder[0]);
    expect(created!.src).toBe(`/StarConquest/audio/${player.getPlaylist()[0]!.filename}`);
  });

  it('restarts at the beginning of the same track on unmute, unless category switched to combat while muted', () => {
    let created: MockAudioElement | null = null;
    const player = new AmbientMusicPlayer({
      baseUrl: '/',
      random: () => 0.5,
      createAudio: (src) => {
        created = new MockAudioElement(src);
        return created;
      },
    });

    player.start();
    // Advance to the 2nd track in the shuffled ambient playlist
    created!.emitEnded();
    const secondAmbientTrack = player.getTrack();
    created!.currentTime = 42.5;

    // Mute -> stops playback and resets playhead to 0
    expect(player.toggleMute()).toBe(true);
    expect(created!.paused).toBe(true);
    expect(created!.currentTime).toBe(0);

    // Unmute (still ambient) -> restarts from 0 on the exact same 2nd ambient track
    expect(player.toggleMute()).toBe(false);
    expect(player.getTrack().id).toBe(secondAmbientTrack.id);
    expect(created!.src).toBe(`/audio/${secondAmbientTrack.filename}`);
    expect(created!.currentTime).toBe(0);
    expect(created!.paused).toBe(false);

    // Mute again, switch category to combat while muted, then unmute -> plays Iron Horizon!
    expect(player.toggleMute()).toBe(true);
    player.setCategory('combat');
    expect(created!.paused).toBe(true);
    expect(player.getCategory()).toBe('combat');
    expect(player.getTrack().id).toBe('combat_iron_horizon');

    expect(player.toggleMute()).toBe(false);
    expect(created!.paused).toBe(false);
    expect(created!.src).toBe('/audio/Iron_Horizon.mp3');
    expect(created!.currentTime).toBe(0);

    player.dispose();
  });

  it('keeps capture-phase autoplay unlock listeners armed until play() actually resolves', async () => {
    const listeners = new Map<string, Set<(e: Event) => void>>();
    const fakeWindow = {
      addEventListener: (type: string, fn: (e: Event) => void) => {
        const set = listeners.get(type) ?? new Set();
        set.add(fn);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, fn: (e: Event) => void) => {
        listeners.get(type)?.delete(fn);
      },
    };
    const prevWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = fakeWindow;

    try {
      let created: MockAudioElement | null = null;
      const player = new AmbientMusicPlayer({
        baseUrl: '/',
        createAudio: (src) => {
          created = new MockAudioElement(src);
          created.rejectRemainingPlays = 2;
          return created;
        },
      });

      player.start();
      await Promise.resolve();
      expect(created!.paused).toBe(true);
      expect(listeners.get('click')?.size).toBe(1);

      for (const fn of listeners.get('pointerdown') ?? []) {
        fn({ target: null } as unknown as Event);
      }
      await Promise.resolve();
      expect(created!.paused).toBe(true);
      expect(listeners.get('click')?.size).toBe(1);

      for (const fn of listeners.get('click') ?? []) {
        fn({ target: null } as unknown as Event);
      }
      await Promise.resolve();
      expect(created!.paused).toBe(false);
      expect(listeners.get('click')?.size).toBe(0);

      player.dispose();
    } finally {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  });

  it('starts playback on the first speaker button click when initial autoplay was blocked', async () => {
    let created: MockAudioElement | null = null;
    const player = new AmbientMusicPlayer({
      baseUrl: '/',
      createAudio: (src) => {
        created = new MockAudioElement(src);
        created.rejectRemainingPlays = 1;
        return created;
      },
    });

    player.start();
    await Promise.resolve();
    expect(player.isMuted()).toBe(false);
    expect(created!.paused).toBe(true);

    expect(player.toggleMute()).toBe(false);
    await Promise.resolve();
    expect(player.isMuted()).toBe(false);
    expect(created!.paused).toBe(false);

    created!.currentTime = 12;
    expect(player.toggleMute()).toBe(true);
    expect(created!.paused).toBe(true);
    expect(created!.currentTime).toBe(0);
  });

  it('crossfades smoothly into combat music (1.8s) and back out to ambient (3.0s), stopping both channels on mute', () => {
    const channels: MockAudioElement[] = [];
    const player = new AmbientMusicPlayer({
      baseUrl: '/',
      random: () => 0.5,
      createAudio: (src) => {
        const ch = new MockAudioElement(src);
        channels.push(ch);
        return ch;
      },
    });

    player.start();
    expect(channels).toHaveLength(1);
    const ambientCh1 = channels[0]!;
    expect(ambientCh1.volume).toBeCloseTo(0.45, 5);
    expect(ambientCh1.paused).toBe(false);

    // Enter combat -> creates combat channel at volume 0 and crossfades over 1.8s
    player.setCategory('combat');
    expect(channels).toHaveLength(2);
    const combatCh = channels[1]!;
    expect(combatCh.src).toBe('/audio/Iron_Horizon.mp3');
    expect(combatCh.volume).toBe(0);
    expect(ambientCh1.paused).toBe(false);
    expect(player.isCrossfading()).toBe(true);

    // Midpoint (0.9s of 1.8s): ambient at 50%, combat at 50%
    player.update(0.9);
    expect(ambientCh1.volume).toBeCloseTo(0.225, 3);
    expect(combatCh.volume).toBeCloseTo(0.275, 3);

    // Finish fade-in (1.8s total): outgoing ambient paused & zeroed, combat at full 0.55
    player.update(0.9);
    expect(player.isCrossfading()).toBe(false);
    expect(ambientCh1.paused).toBe(true);
    expect(ambientCh1.volume).toBe(0);
    expect(combatCh.volume).toBeCloseTo(0.55, 5);

    // Exit combat -> crossfades back to ambient over 3.0s
    player.setCategory('ambient');
    expect(channels).toHaveLength(3);
    const ambientCh2 = channels[2]!;
    expect(ambientCh2.volume).toBe(0);
    player.update(1.5);
    expect(combatCh.volume).toBeCloseTo(0.275, 3);
    expect(ambientCh2.volume).toBeCloseTo(0.225, 3);

    // Muting mid-crossfade immediately halts both channels
    player.setMuted(true);
    expect(player.isCrossfading()).toBe(false);
    expect(combatCh.paused).toBe(true);
    expect(ambientCh2.paused).toBe(true);
    player.dispose();
  });
});
