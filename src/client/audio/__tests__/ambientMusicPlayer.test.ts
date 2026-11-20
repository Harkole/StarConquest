import { describe, expect, it } from 'vitest';
import {
  AmbientMusicPlayer,
  MUSIC_TRACKS,
  resolveAudioTrackUrl,
  type AudioElementLike,
} from '../ambientMusicPlayer.ts';

class MockAudioElement implements AudioElementLike {
  public loop = false;
  public volume = 1;
  public currentTime = 0;
  public paused = true;
  public playCalls = 0;
  public pauseCalls = 0;
  public rejectRemainingPlays = 0;

  public constructor(public readonly src: string) {}

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

  it('loads The_View_from_Perigee.mp3 with loop enabled and starts playing from the beginning', () => {
    let created: MockAudioElement | null = null;
    const player = new AmbientMusicPlayer({
      baseUrl: '/StarConquest/',
      createAudio: (src) => {
        created = new MockAudioElement(src);
        return created;
      },
    });

    expect(MUSIC_TRACKS[0]?.filename).toBe('The_View_from_Perigee.mp3');
    expect(MUSIC_TRACKS[0]?.category).toBe('ambient');
    expect(created).not.toBeNull();
    expect(created!.src).toBe('/StarConquest/audio/The_View_from_Perigee.mp3');
    expect(created!.loop).toBe(true);
    expect(player.isMuted()).toBe(false);

    player.start();
    expect(created!.paused).toBe(false);
    expect(created!.playCalls).toBe(1);
    expect(created!.currentTime).toBe(0);
  });

  it('stops playback and resets to 0 on mute, then restarts from the beginning on unmute', () => {
    let created: MockAudioElement | null = null;
    const player = new AmbientMusicPlayer({
      baseUrl: '/',
      createAudio: (src) => {
        created = new MockAudioElement(src);
        return created;
      },
    });

    player.start();
    created!.currentTime = 42.5;

    expect(player.toggleMute()).toBe(true);
    expect(player.isMuted()).toBe(true);
    expect(created!.paused).toBe(true);
    expect(created!.pauseCalls).toBe(1);
    expect(created!.currentTime).toBe(0);

    created!.currentTime = 15;
    expect(player.toggleMute()).toBe(false);
    expect(player.isMuted()).toBe(false);
    expect(created!.paused).toBe(false);
    expect(created!.currentTime).toBe(0);
    expect(created!.playCalls).toBe(2);

    player.dispose();
    expect(created!.paused).toBe(true);
    expect(created!.currentTime).toBe(0);
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
          // Reject initial start() AND the first pointerdown attempt; succeed on click!
          created.rejectRemainingPlays = 2;
          return created;
        },
      });

      player.start();
      await Promise.resolve();
      expect(created!.paused).toBe(true);
      expect(listeners.get('click')?.size).toBe(1);

      // First gesture (pointerdown) still rejected -> listeners MUST stay armed
      for (const fn of listeners.get('pointerdown') ?? []) {
        fn({ target: null } as unknown as Event);
      }
      await Promise.resolve();
      expect(created!.paused).toBe(true);
      expect(listeners.get('click')?.size).toBe(1);

      // Second gesture (click) succeeds -> playback starts and listeners are cleaned up
      for (const fn of listeners.get('click') ?? []) {
        fn({ target: null } as unknown as Event);
      }
      await Promise.resolve();
      expect(created!.paused).toBe(false);
      expect(listeners.get('click')?.size).toBe(0);
      expect(listeners.get('pointerdown')?.size).toBe(0);

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

    // First click on speaker button while autoplay-blocked starts music instead of muting
    expect(player.toggleMute()).toBe(false);
    await Promise.resolve();
    expect(player.isMuted()).toBe(false);
    expect(created!.paused).toBe(false);

    // Subsequent click while playing mutes and resets to 0 as expected
    created!.currentTime = 12;
    expect(player.toggleMute()).toBe(true);
    expect(created!.paused).toBe(true);
    expect(created!.currentTime).toBe(0);
  });
});
