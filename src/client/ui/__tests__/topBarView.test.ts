import { describe, expect, it } from 'vitest';
import { LocalSimAdapter } from '../../net/localSimAdapter.ts';
import { buildTopBarModel, mountTopBar } from '../topBarView.ts';

class FakeTopBarElement {
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public textContent = '';
  public title = '';
  private html = '';
  private readonly attrs = new Map<string, string>();
  private readonly classes = new Set<string>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly queried = new Map<string, FakeTopBarElement[]>();

  public readonly classList = {
    add: (cls: string): void => {
      this.classes.add(cls);
    },
    remove: (cls: string): void => {
      this.classes.delete(cls);
    },
    toggle: (cls: string, force?: boolean): boolean => {
      const next = force !== undefined ? force : !this.classes.has(cls);
      if (next) {
        this.classes.add(cls);
      } else {
        this.classes.delete(cls);
      }
      return next;
    },
    contains: (cls: string): boolean => this.classes.has(cls),
  };

  public get innerHTML(): string {
    return this.html;
  }

  public set innerHTML(value: string) {
    this.html = value;
    this.queried.clear();
  }

  public setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  public getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  public addEventListener(type: string, cb: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb);
    this.listeners.set(type, set);
  }

  public click(): void {
    for (const fn of this.listeners.get('click') ?? []) {
      fn();
    }
  }

  public querySelector<T = FakeTopBarElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  public querySelectorAll<T = FakeTopBarElement>(selector: string): T[] {
    const cached = this.queried.get(selector);
    if (cached) {
      return cached as unknown as T[];
    }
    const matches: FakeTopBarElement[] = [];
    if (selector === '[data-speed]') {
      for (const match of this.html.matchAll(/data-speed="(\d+)"/g)) {
        const el = new FakeTopBarElement();
        el.dataset.speed = match[1]!;
        matches.push(el);
      }
    } else if (selector.startsWith('#')) {
      const id = selector.slice(1);
      if (this.html.includes(`id="${id}"`)) {
        matches.push(new FakeTopBarElement());
      }
    } else if (selector.startsWith('[data-action="')) {
      const action = selector.slice('[data-action="'.length, -2);
      if (this.html.includes(`data-action="${action}"`)) {
        const el = new FakeTopBarElement();
        el.dataset.action = action;
        matches.push(el);
      }
    }
    this.queried.set(selector, matches);
    return matches as unknown as T[];
  }
}

describe('topBarView', () => {
  it('builds initial model with 00:00 clock, contenders status, and speed/mute pass-through', () => {
    const adapter = new LocalSimAdapter('standard_tactical');
    const sim = adapter.simulation;
    const homeSystem = sim.galaxy.systems.find((s) => s.id === 'system_starter_1')!;

    const model = buildTopBarModel(sim, {
      playerId: 'player_1',
      activeSystemId: homeSystem.id,
      speed: 2,
      musicMuted: true,
    });

    expect(model.matchClock).toBe('00:00');
    expect(model.matchStatus.tone).toBe('contenders');
    expect(model.matchStatus.label).toBe('4/4 C&C');
    expect(model.systemName).toBe(homeSystem.name);
    expect(model.yieldLabel).toBe('Unscanned Sector');
    expect(model.speed).toBe(2);
    expect(model.musicMuted).toBe(true);
    expect(model.ore).toBeGreaterThan(0);
    expect(model.harvesters).toBe(1);
  });

  it('mounts speed and music controls without removed lobby, tutorial, or mining buttons', () => {
    const adapter = new LocalSimAdapter('standard_tactical');
    const host = new FakeTopBarElement();
    const speedCalls: number[] = [];
    let musicToggles = 0;
    let quitCalls = 0;

    const handle = mountTopBar(host as unknown as HTMLElement, {
      onSetSpeed: (spd) => speedCalls.push(spd),
      onToggleMusic: () => {
        musicToggles += 1;
      },
      onQuitToMainMenu: () => {
        quitCalls += 1;
      },
    });

    expect(host.innerHTML).toContain('data-speed="1"');
    expect(host.innerHTML).toContain('data-speed="2"');
    expect(host.innerHTML).toContain('data-speed="4"');
    expect(host.innerHTML).toContain('data-action="toggle-music"');
    expect(host.innerHTML).toContain('data-action="quit-to-main-menu"');
    expect(host.innerHTML).not.toContain('toggle-lobby');
    expect(host.innerHTML).not.toContain('start-tutorial');
    expect(host.innerHTML).not.toContain('toggle-hub-mining');

    handle.update(
      buildTopBarModel(adapter.simulation, {
        playerId: 'player_1',
        activeSystemId: adapter.simulation.galaxy.systems[0]!.id,
        speed: 4,
        musicMuted: false,
      }),
    );

    expect(host.querySelector('#hud-top-match-clock')?.textContent).toBe('00:00');
    expect(host.querySelector('#hud-match-status-val')?.textContent).toBe('4/4 C&C');

    const speedButtons = host.querySelectorAll('[data-speed]');
    expect(speedButtons).toHaveLength(3);
    expect(speedButtons[2]!.classList.contains('active')).toBe(true);
    speedButtons[1]!.click();
    expect(speedCalls).toEqual([2]);

    host.querySelector('[data-action="toggle-music"]')!.click();
    expect(musicToggles).toBe(1);

    host.querySelector('[data-action="quit-to-main-menu"]')!.click();
    expect(quitCalls).toBe(1);
  });

  it('renders Menu (Esc) button when onOpenPauseMenu is provided', () => {
    const host = new FakeTopBarElement();
    let pauseCalls = 0;

    mountTopBar(host as unknown as HTMLElement, {
      onSetSpeed: () => {},
      onToggleMusic: () => {},
      onOpenPauseMenu: () => {
        pauseCalls += 1;
      },
    });

    expect(host.innerHTML).toContain('data-action="open-pause-menu"');
    expect(host.innerHTML).toContain('Menu (Esc)');
    expect(host.innerHTML).not.toContain('data-action="quit-to-main-menu"');

    host.querySelector('[data-action="open-pause-menu"]')!.click();
    expect(pauseCalls).toBe(1);
  });
});
