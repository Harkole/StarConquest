import { describe, expect, it } from 'vitest';
import {
  AmbientMusicPlayer,
  MUSIC_TRACKS,
  type AudioElementLike,
} from '../ambientMusicPlayer.ts';

class MockAudioElement implements AudioElementLike {
  public loop = false;
  public volume = 1;
  public currentTime = 0;
  public paused = true;
  public playCalls = 0;
  public pauseCalls = 0;
  public rejectNextPlay = false;

  public constructor(public readonly src: string) {}

  public play(): Promise<void> {
    this.playCalls += 1;
    if (this.rejectNextPlay) {
      this.rejectNextPlay = false;
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
    // Simulate playback advancing 42 seconds into the track
    created!.currentTime = 42.5;

    // Mute -> stops playback and resets playhead to 0
    expect(player.toggleMute()).toBe(true);
    expect(player.isMuted()).toBe(true);
    expect(created!.paused).toBe(true);
    expect(created!.pauseCalls).toBe(1);
    expect(created!.currentTime).toBe(0);

    // Unmute -> restarts cleanly from 0 and resumes playback
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
});
