import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../../shared/sim/gameSimulation.ts';
import { TUTORIAL_STEPS, type TutorialUiContext } from '../../../shared/sim/tutorialSteps.ts';
import { TutorialController } from '../tutorialController.ts';

class FakeClassList {
  private readonly classes = new Set<string>();

  public add(name: string): void {
    this.classes.add(name);
  }

  public remove(name: string): void {
    this.classes.delete(name);
  }

  public contains(name: string): boolean {
    return this.classes.has(name);
  }
}

class FakeElement {
  public className = '';
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public classList = new FakeClassList();
  public children: FakeElement[] = [];
  private html = '';
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly interactiveBySelector = new Map<string, FakeElement[]>();

  public get innerHTML(): string {
    return this.html;
  }

  public set innerHTML(value: string) {
    this.html = value;
    this.interactiveBySelector.clear();
  }

  public append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
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

  public querySelector<T = FakeElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  public querySelectorAll<T = FakeElement>(selector: string): T[] {
    if (selector === '.tutorial-highlight') {
      const results: FakeElement[] = [];
      const visit = (node: FakeElement): void => {
        if (node.classList.contains('tutorial-highlight')) {
          results.push(node);
        }
        for (const child of node.children) {
          visit(child);
        }
      };
      visit(this);
      return results as unknown as T[];
    }

    const attrMatch = /^\[([^=\]]+)="([^"]+)"\]$/.exec(selector);
    if (attrMatch) {
      const attrName = attrMatch[1]!;
      const attrVal = attrMatch[2]!;
      const datasetKey = attrName
        .replace(/^data-/, '')
        .replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());

      const treeMatches: FakeElement[] = [];
      const visit = (node: FakeElement): void => {
        if (node.dataset[datasetKey] === attrVal) {
          treeMatches.push(node);
        }
        for (const child of node.children) {
          visit(child);
        }
      };
      visit(this);
      if (treeMatches.length > 0) {
        return treeMatches as unknown as T[];
      }

      const cached = this.interactiveBySelector.get(selector);
      if (cached) {
        return cached as unknown as T[];
      }
      if (this.html.includes(`${attrName}="${attrVal}"`)) {
        const el = new FakeElement();
        el.dataset[datasetKey] = attrVal;
        const list = [el];
        this.interactiveBySelector.set(selector, list);
        return list as unknown as T[];
      }
      return [];
    }

    return [];
  }
}

function withFakeDocument<T>(fn: () => T): T {
  const prevDoc = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    createElement: () => new FakeElement(),
  };
  try {
    return fn();
  } finally {
    (globalThis as { document?: unknown }).document = prevDoc;
  }
}

function makeTargetNode(attrKey: string, attrVal: string): FakeElement {
  const el = new FakeElement();
  el.dataset[attrKey] = attrVal;
  return el;
}

function makeBaseUiContext(overrides: Partial<TutorialUiContext> = {}): TutorialUiContext {
  return {
    homePlanetId: 'system_starter_1_homeworld',
    homeSystemId: 'system_starter_1',
    selectedPlanetId: 'system_starter_1_homeworld',
    selectedSlotOccupied: false,
    firstEmptySlotIndex: 2,
    isOrbitalRingCollapsed: false,
    ...overrides,
  };
}

describe('TutorialController', () => {
  it('renders Step 1 when initialized with tutorial preset and hides on non-tutorial presets', () => {
    withFakeDocument(() => {
      const host = new FakeElement();
      const hudRoot = new FakeElement();

      const inactiveController = new TutorialController({
        hostContainer: host as unknown as HTMLElement,
        hudRoot: hudRoot as unknown as HTMLElement,
        initialPresetId: 'standard_tactical',
      });
      expect(inactiveController.getRootElement().style.display).toBe('none');

      const activeHost = new FakeElement();
      const controller = new TutorialController({
        hostContainer: activeHost as unknown as HTMLElement,
        hudRoot: hudRoot as unknown as HTMLElement,
        initialPresetId: 'tutorial',
      });

      const coachEl = controller.getRootElement();
      expect(coachEl.style.display).toBe('flex');
      expect(coachEl.dataset.hudPanel).toBe('tutorial-tracker');
      expect(coachEl.innerHTML).toContain('GUIDED TUTORIAL');
      expect(coachEl.innerHTML).toContain(`Step 1 / ${TUTORIAL_STEPS.length}`);
      expect(coachEl.innerHTML).toContain(TUTORIAL_STEPS[0]!.title);
      expect(coachEl.innerHTML).toContain(TUTORIAL_STEPS[0]!.instruction);
      expect(coachEl.innerHTML).toContain(TUTORIAL_STEPS[0]!.hint);
      expect(coachEl.innerHTML).toContain('data-action="tutorial-skip"');
      expect(coachEl.innerHTML).toContain('data-action="tutorial-dismiss"');
    });
  });

  it('applies and clears .tutorial-highlight across HUD target elements', () => {
    withFakeDocument(() => {
      const sim = new GameSimulation('tutorial');
      const host = new FakeElement();
      const hudRoot = new FakeElement();

      const planetBtn = makeTargetNode('planetId', 'system_starter_1_homeworld');
      const slotBtn = makeTargetNode('slotIndex', '2');
      const refineryBtn = makeTargetNode('buildStruct', 'refinery');
      const speedBtn = makeTargetNode('speed', '4');
      const sysNavBtn = makeTargetNode('systemId', 'system_central_hub');
      hudRoot.append(planetBtn, slotBtn, refineryBtn, speedBtn, sysNavBtn);

      const controller = new TutorialController({
        hostContainer: host as unknown as HTMLElement,
        hudRoot: hudRoot as unknown as HTMLElement,
        initialPresetId: 'tutorial',
      });

      controller.sync(
        sim,
        'player_1',
        makeBaseUiContext({ selectedPlanetId: 'system_starter_2_homeworld' }),
      );
      expect(planetBtn.classList.contains('tutorial-highlight')).toBe(true);
      expect(refineryBtn.classList.contains('tutorial-highlight')).toBe(false);

      controller.applyCurrentHighlight(
        sim,
        'player_1',
        makeBaseUiContext({ selectedSlotOccupied: true }),
      );
      expect(planetBtn.classList.contains('tutorial-highlight')).toBe(false);
      expect(slotBtn.classList.contains('tutorial-highlight')).toBe(true);

      controller.applyCurrentHighlight(sim, 'player_1', makeBaseUiContext());
      expect(slotBtn.classList.contains('tutorial-highlight')).toBe(false);
      expect(refineryBtn.classList.contains('tutorial-highlight')).toBe(true);
    });
  });

  it('advances via Skip Step, renders completed state with Open Match Lobby, and hides on Dismiss or resetForMatch', () => {
    withFakeDocument(() => {
      const sim = new GameSimulation('tutorial');
      const host = new FakeElement();
      const hudRoot = new FakeElement();
      const refineryBtn = makeTargetNode('buildStruct', 'refinery');
      hudRoot.append(refineryBtn);

      let lobbyOpened = false;
      const controller = new TutorialController({
        hostContainer: host as unknown as HTMLElement,
        hudRoot: hudRoot as unknown as HTMLElement,
        initialPresetId: 'tutorial',
        onOpenLobby: () => {
          lobbyOpened = true;
        },
      });

      controller.sync(sim, 'player_1', makeBaseUiContext());
      expect(refineryBtn.classList.contains('tutorial-highlight')).toBe(true);

      const coachEl = controller.getRootElement();
      for (let i = 0; i < TUTORIAL_STEPS.length; i += 1) {
        const skipBtn = coachEl.querySelector<HTMLButtonElement>(
          '[data-action="tutorial-skip"]',
        )!;
        expect(skipBtn).not.toBeNull();
        skipBtn.click();
      }

      expect(controller.getState().status).toBe('completed');
      expect(refineryBtn.classList.contains('tutorial-highlight')).toBe(false);
      expect(coachEl.innerHTML).toContain('TUTORIAL COMPLETE');
      expect(coachEl.innerHTML).toContain('Cadet AI');

      const openLobbyBtn = coachEl.querySelector<HTMLButtonElement>(
        '[data-action="tutorial-open-lobby"]',
      )!;
      openLobbyBtn.click();
      expect(lobbyOpened).toBe(true);

      const dismissBtn = coachEl.querySelector<HTMLButtonElement>(
        '[data-action="tutorial-dismiss"]',
      )!;
      dismissBtn.click();
      expect(controller.getState().status).toBe('dismissed');
      expect(coachEl.style.display).toBe('none');

      controller.resetForMatch('tutorial');
      expect(controller.getState().status).toBe('active');
      expect(coachEl.style.display).toBe('flex');

      controller.sync(sim, 'player_1', makeBaseUiContext());
      expect(refineryBtn.classList.contains('tutorial-highlight')).toBe(true);

      controller.resetForMatch('standard_tactical');
      expect(controller.getState().status).toBe('inactive');
      expect(coachEl.style.display).toBe('none');
      expect(refineryBtn.classList.contains('tutorial-highlight')).toBe(false);
    });
  });

  it('anchors inside hostContainer without getBoundingClientRect and highlights create-fleet directly on Step 4', () => {
    withFakeDocument(() => {
      const sim = new GameSimulation('tutorial');
      const topRightSlot = new FakeElement();
      topRightSlot.className = 'hud-top-right-slot';
      const hudRoot = new FakeElement();
      const createFleetBtn = makeTargetNode('action', 'create-fleet');
      hudRoot.append(createFleetBtn);

      const controller = new TutorialController({
        hostContainer: topRightSlot as unknown as HTMLElement,
        hudRoot: hudRoot as unknown as HTMLElement,
        initialPresetId: 'tutorial',
      });

      expect(topRightSlot.children).toContain(controller.getRootElement());
      expect(controller.getRootElement().style.left).toBeUndefined();
      expect(controller.getRootElement().style.top).toBeUndefined();

      // Advance to Step 4 (create_fleet)
      const coachEl = controller.getRootElement();
      for (let i = 0; i < 3; i += 1) {
        coachEl.querySelector<HTMLButtonElement>('[data-action="tutorial-skip"]')!.click();
      }
      controller.applyCurrentHighlight(sim, 'player_1', makeBaseUiContext());
      expect(createFleetBtn.classList.contains('tutorial-highlight')).toBe(true);
    });
  });
});