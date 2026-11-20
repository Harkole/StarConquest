export type MusicTrackCategory = 'ambient' | 'combat';

export interface MusicTrackDescriptor {
  readonly id: string;
  readonly title: string;
  readonly filename: string;
  readonly category: MusicTrackCategory;
  readonly loop: boolean;
  readonly volume: number;
}

/**
 * Canonical music track registry (mirrors `docs/sounds.md`).
 * Additional `ambient` and `combat`-flagged tracks register here as they are added.
 */
export const MUSIC_TRACKS: readonly MusicTrackDescriptor[] = [
  {
    id: 'ambient_view_from_perigee',
    title: 'The View from Perigee',
    filename: 'The_View_from_Perigee.mp3',
    category: 'ambient',
    loop: true,
    volume: 0.45,
  },
];

export interface AudioElementLike {
  loop: boolean;
  volume: number;
  currentTime: number;
  readonly paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
}

export interface AmbientMusicPlayerOptions {
  readonly baseUrl?: string;
  readonly track?: MusicTrackDescriptor;
  readonly createAudio?: (src: string) => AudioElementLike;
}

function defaultCreateAudio(src: string): AudioElementLike {
  const audio = new Audio(src);
  audio.preload = 'auto';
  return audio;
}

/**
 * Resolves the public audio track URL using Vite's literal `import.meta.env.BASE_URL`
 * replacement so production builds on subpaths (e.g. `/StarConquest/`) always load
 * `/StarConquest/audio/<filename>` rather than root `/audio/<filename>`.
 */
export function resolveAudioTrackUrl(filename: string, baseUrlOverride?: string): string {
  // Keep `import.meta.env.BASE_URL` as a literal expression so Vite statically inlines it at build time
  const rawBase = baseUrlOverride ?? import.meta.env.BASE_URL ?? '/';
  const normalizedBase = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
  return `${normalizedBase}audio/${filename}`;
}

const AUTOPLAY_UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'click', 'keydown'] as const;

/**
 * Client-only ambient music controller for StarConquest (`docs/sounds.md`).
 * Loops the active ambient track continuously while unmuted.
 * Muting stops playback and resets to 0; unmuting restarts cleanly from the beginning.
 */
export class AmbientMusicPlayer {
  private readonly track: MusicTrackDescriptor;
  private readonly audio: AudioElementLike;
  private muted = false;
  private waitingForUserGesture = false;
  private unlockHandler: ((event: Event) => void) | null = null;

  constructor(options: AmbientMusicPlayerOptions = {}) {
    this.track = options.track ?? MUSIC_TRACKS[0]!;
    const src = resolveAudioTrackUrl(this.track.filename, options.baseUrl);

    const factory = options.createAudio ?? defaultCreateAudio;
    this.audio = factory(src);
    this.audio.loop = this.track.loop;
    this.audio.volume = this.track.volume;
  }

  public getTrack(): MusicTrackDescriptor {
    return this.track;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Begins looping playback if not muted. If the browser's autoplay policy blocks
   * immediate playback, arms capture-phase user-gesture listeners that keep trying
   * until playback actually succeeds.
   */
  public start(): void {
    if (this.muted) {
      return;
    }
    this.audio.currentTime = 0;
    this.attemptPlay();
  }

  /**
   * Mutes or unmutes the soundtrack:
   * - `muted = true`: stops playback and resets `currentTime = 0`.
   * - `muted = false`: restarts playback from the beginning (`currentTime = 0`).
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.clearAutoplayUnlockListener();
      this.audio.pause();
      this.audio.currentTime = 0;
      return;
    }
    this.audio.currentTime = 0;
    this.attemptPlay();
  }

  /** Toggles mute state and returns the new `isMuted()` value. */
  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public dispose(): void {
    this.clearAutoplayUnlockListener();
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  private attemptPlay(): void {
    try {
      const result = this.audio.play();
      if (result && typeof result.then === 'function') {
        void result.then(
          () => {
            if (!this.muted) {
              this.clearAutoplayUnlockListener();
            }
          },
          () => {
            if (!this.muted) {
              this.armAutoplayUnlockListener();
            }
          },
        );
      } else {
        this.clearAutoplayUnlockListener();
      }
    } catch {
      if (!this.muted) {
        this.armAutoplayUnlockListener();
      }
    }
  }

  private armAutoplayUnlockListener(): void {
    if (this.waitingForUserGesture || typeof window === 'undefined') {
      return;
    }
    this.waitingForUserGesture = true;
    this.unlockHandler = (event: Event) => {
      if (this.muted) {
        this.clearAutoplayUnlockListener();
        return;
      }
      // Do not race with the user clicking the mute button as their very first gesture
      const target = event.target as { closest?: (sel: string) => unknown } | null;
      if (target && typeof target.closest === 'function' && target.closest('[data-action="toggle-music"]')) {
        return;
      }
      this.attemptPlay();
    };
    for (const evt of AUTOPLAY_UNLOCK_EVENTS) {
      window.addEventListener(evt, this.unlockHandler, { capture: true });
    }
  }

  private clearAutoplayUnlockListener(): void {
    if (!this.waitingForUserGesture || !this.unlockHandler || typeof window === 'undefined') {
      return;
    }
    for (const evt of AUTOPLAY_UNLOCK_EVENTS) {
      window.removeEventListener(evt, this.unlockHandler, { capture: true });
    }
    this.unlockHandler = null;
    this.waitingForUserGesture = false;
  }
}
