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
    loop: false,
    volume: 0.45,
  },
  {
    id: 'ambient_weight_of_the_far_horizon',
    title: 'Weight of the Far Horizon',
    filename: 'Weight_of_the_Far_Horizon.mp3',
    category: 'ambient',
    loop: false,
    volume: 0.45,
  },
  {
    id: 'ambient_passing_the_last_horizon',
    title: 'Passing The Last Horizon',
    filename: 'Passing_The_Last_Horizon.mp3',
    category: 'ambient',
    loop: false,
    volume: 0.45,
  },
  {
    id: 'ambient_armada_at_the_edge',
    title: 'Armada at the Edge',
    filename: 'Armada_at_the_Edge.mp3',
    category: 'ambient',
    loop: false,
    volume: 0.45,
  },
  {
    id: 'combat_iron_horizon',
    title: 'Iron Horizon',
    filename: 'Iron_Horizon.mp3',
    category: 'combat',
    loop: false,
    volume: 0.55,
  },
];

export interface AudioElementLike {
  src: string;
  loop: boolean;
  volume: number;
  currentTime: number;
  readonly paused: boolean;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
}

export interface AmbientMusicPlayerOptions {
  readonly baseUrl?: string;
  readonly tracks?: readonly MusicTrackDescriptor[];
  readonly initialCategory?: MusicTrackCategory;
  readonly random?: () => number;
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

/** Fisher-Yates shuffle returning a new array without mutating the input. */
export function shuffleTracks<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = result[i]!;
    result[i] = result[j]!;
    result[j] = tmp;
  }
  return result;
}

const AUTOPLAY_UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'click', 'keydown'] as const;

/**
 * Client-only soundtrack playlist controller for StarConquest (`docs/sounds.md`).
 * - Shuffles the active category playlist (`ambient` or `combat`) on load, then loops
 *   through the shuffled order once every track has played once.
 * - Muting stops playback and resets `currentTime = 0`; unmuting restarts from the
 *   beginning of the track it was playing unless the music category changed (e.g. to `combat`).
 */
export class AmbientMusicPlayer {
  private readonly baseUrlOverride: string | undefined;
  private readonly allTracks: readonly MusicTrackDescriptor[];
  private readonly random: () => number;
  private readonly audio: AudioElementLike;
  private readonly onEndedHandler: () => void;

  private category: MusicTrackCategory;
  private playlist: MusicTrackDescriptor[] = [];
  private currentIndex = 0;
  private muted = false;
  private waitingForUserGesture = false;
  private unlockHandler: ((event: Event) => void) | null = null;

  constructor(options: AmbientMusicPlayerOptions = {}) {
    this.baseUrlOverride = options.baseUrl;
    this.allTracks = options.tracks ?? MUSIC_TRACKS;
    this.random = options.random ?? Math.random;
    this.category = options.initialCategory ?? 'ambient';

    this.playlist = this.buildShuffledPlaylist(this.category);
    this.currentIndex = 0;

    const firstTrack = this.getTrack();
    const initialSrc = resolveAudioTrackUrl(firstTrack.filename, this.baseUrlOverride);
    const factory = options.createAudio ?? defaultCreateAudio;
    this.audio = factory(initialSrc);
    this.applyTrackToAudio(firstTrack, false);

    this.onEndedHandler = () => {
      if (this.muted || this.playlist.length <= 1) {
        return;
      }
      this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
      this.applyTrackToAudio(this.getTrack(), true);
      this.attemptPlay();
    };
    this.audio.addEventListener?.('ended', this.onEndedHandler);
  }

  public getCategory(): MusicTrackCategory {
    return this.category;
  }

  public getPlaylist(): readonly MusicTrackDescriptor[] {
    return this.playlist;
  }

  public getTrack(): MusicTrackDescriptor {
    return this.playlist[this.currentIndex] ?? this.allTracks[0]!;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Switches between `'ambient'` and `'combat'` track playlists.
   * If unmuted, immediately starts playing the new category's shuffled playlist;
   * if muted, stays stopped and prepares the new category so unmuting plays it.
   */
  public setCategory(nextCategory: MusicTrackCategory): void {
    if (nextCategory === this.category) {
      return;
    }
    const nextPlaylist = this.buildShuffledPlaylist(nextCategory);
    if (nextPlaylist.length === 0) {
      return;
    }
    this.category = nextCategory;
    this.playlist = nextPlaylist;
    this.currentIndex = 0;

    this.audio.pause();
    this.applyTrackToAudio(this.getTrack(), true);
    if (!this.muted) {
      this.attemptPlay();
    }
  }

  /**
   * Begins shuffled playlist playback if not muted. If the browser's autoplay policy
   * blocks immediate playback, arms capture-phase user-gesture listeners that keep trying
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
   * - `muted = false`: restarts from the beginning (`currentTime = 0`) of the current track
   *   (or the new category's track if category switched while muted).
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

  /**
   * Toggles mute state and returns the new `isMuted()` value.
   * If unmuted playback was blocked by the browser's autoplay policy (still paused),
   * clicking the speaker button starts playback immediately on the first click instead
   * of requiring a mute -> unmute double toggle.
   */
  public toggleMute(): boolean {
    if (!this.muted && this.audio.paused) {
      this.audio.currentTime = 0;
      this.attemptPlay();
      return false;
    }
    this.setMuted(!this.muted);
    return this.muted;
  }

  public dispose(): void {
    this.clearAutoplayUnlockListener();
    this.audio.removeEventListener?.('ended', this.onEndedHandler);
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  private buildShuffledPlaylist(category: MusicTrackCategory): MusicTrackDescriptor[] {
    const matching = this.allTracks.filter((t) => t.category === category);
    const source = matching.length > 0 ? matching : this.allTracks;
    return shuffleTracks(source, this.random);
  }

  private applyTrackToAudio(track: MusicTrackDescriptor, updateSrc: boolean): void {
    if (updateSrc) {
      this.audio.src = resolveAudioTrackUrl(track.filename, this.baseUrlOverride);
    }
    // Native audio.loop only when the active playlist has a single track; multi-track playlists advance via 'ended'
    this.audio.loop = this.playlist.length <= 1;
    this.audio.volume = track.volume;
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
      if (
        target &&
        typeof target.closest === 'function' &&
        target.closest('[data-action="toggle-music"]')
      ) {
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
