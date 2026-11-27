import type { MatchPresetId } from '../../shared/config/index.ts';
import type { PlayerSlotId } from '../../shared/protocol/commands.ts';
import type { SimulationView } from '../../shared/sim/simulationView.ts';
import {
  TUTORIAL_STEPS,
  createInitialTutorialState,
  dismissTutorial,
  evaluateTutorialProgress,
  getCurrentTutorialStep,
  skipCurrentTutorialStep,
  type TutorialHighlightTarget,
  type TutorialProgressState,
  type TutorialUiContext,
} from '../../shared/sim/tutorialSteps.ts';

export interface TutorialControllerOptions {
  readonly hostContainer: HTMLElement;
  readonly hudRoot: HTMLElement;
  readonly initialPresetId: MatchPresetId;
  readonly onOpenLobby?: () => void;
}

function resolveHighlightSelector(target: TutorialHighlightTarget): string | null {
  switch (target.kind) {
    case 'planet':
      return `[data-planet-id="${target.planetId}"]`;
    case 'slot':
      return `[data-slot-index="${target.slotIndex}"]`;
    case 'section':
      return `[data-toggle-section="${target.sectionId}"]`;
    case 'build-struct':
      return `[data-build-struct="${target.structureId}"]`;
    case 'action':
      return `[data-action="${target.action}"]`;
    case 'fleet-inc':
      return `[data-fleet-inc="${target.hull}"]`;
    case 'speed':
      return `[data-speed="${target.speed}"]`;
    case 'system-nav':
      return `[data-system-id="${target.systemId}"]`;
    case 'none':
      return null;
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

export class TutorialController {
  private readonly hudRoot: HTMLElement;
  private readonly onOpenLobby?: () => void;
  private readonly coachEl: HTMLElement;

  private state: TutorialProgressState;
  private lastRenderSig = '';

  constructor(options: TutorialControllerOptions) {
    this.hudRoot = options.hudRoot;
    this.onOpenLobby = options.onOpenLobby;
    this.state = createInitialTutorialState(options.initialPresetId);

    this.coachEl = document.createElement('div');
    this.coachEl.className = 'hud-tutorial-coach';
    this.coachEl.dataset.hudPanel = 'tutorial-tracker';
    options.hostContainer.append(this.coachEl);

    this.renderCoach();
  }

  public getRootElement(): HTMLElement {
    return this.coachEl;
  }

  public getState(): TutorialProgressState {
    return this.state;
  }

  public resetForMatch(presetId: MatchPresetId): void {
    this.state = createInitialTutorialState(presetId);
    this.lastRenderSig = '';
    if (this.state.status === 'inactive') {
      this.clearHighlights();
    }
    this.renderCoach();
  }

  public sync(
    sim: SimulationView,
    playerId: PlayerSlotId,
    uiContext: TutorialUiContext,
  ): void {
    this.state = evaluateTutorialProgress(this.state, sim, playerId);
    const nextSig = this.computeRenderSig();
    if (nextSig !== this.lastRenderSig) {
      this.renderCoach();
    }
    this.applyCurrentHighlight(sim, playerId, uiContext);
  }

  public applyCurrentHighlight(
    sim: SimulationView,
    playerId: PlayerSlotId,
    uiContext: TutorialUiContext,
  ): void {
    this.clearHighlights();
    if (this.state.status !== 'active') {
      return;
    }
    const step = getCurrentTutorialStep(this.state);
    if (!step) {
      return;
    }
    const target = step.resolveHighlight(sim, playerId, uiContext);
    const selector = resolveHighlightSelector(target);
    if (!selector) {
      return;
    }
    this.hudRoot
      .querySelectorAll<HTMLElement>(selector)
      .forEach((el) => {
        el.classList.add('tutorial-highlight');
      });
  }

  public dispose(): void {
    this.clearHighlights();
    this.coachEl.remove();
  }

  private clearHighlights(): void {
    this.hudRoot
      .querySelectorAll<HTMLElement>('.tutorial-highlight')
      .forEach((el) => {
        el.classList.remove('tutorial-highlight');
      });
  }

  private computeRenderSig(): string {
    return `${this.state.status}:${this.state.currentStepIndex}:${this.state.completedStepIds.join(',')}`;
  }

  private renderCoach(): void {
    this.lastRenderSig = this.computeRenderSig();

    if (this.state.status === 'inactive' || this.state.status === 'dismissed') {
      this.coachEl.style.display = 'none';
      this.coachEl.innerHTML = '';
      return;
    }

    if (this.state.status === 'completed') {
      this.clearHighlights();
      this.coachEl.style.display = 'flex';
      this.coachEl.innerHTML = `
        <div class="tutorial-coach-header">
          <span class="hud-badge tutorial-coach-badge">TUTORIAL COMPLETE</span>
        </div>
        <div class="tutorial-coach-title">Cadet AI Defeated</div>
        <div class="tutorial-coach-instruction">
          Congratulations, Commander! You built your orbital economy, assembled a Cruiser battle fleet, crossed the wormhole, and defeated the Cadet AI.
        </div>
        <div class="hud-btn-row" style="margin-top: 4px;">
          <button type="button" class="hud-btn active" data-action="tutorial-open-lobby">
            Open Match Lobby
          </button>
          <button type="button" class="hud-btn" data-action="tutorial-dismiss">
            Dismiss
          </button>
        </div>
      `;

      this.coachEl
        .querySelector<HTMLButtonElement>('[data-action="tutorial-open-lobby"]')
        ?.addEventListener('click', () => {
          this.onOpenLobby?.();
        });

      this.coachEl
        .querySelector<HTMLButtonElement>('[data-action="tutorial-dismiss"]')
        ?.addEventListener('click', () => {
          this.state = dismissTutorial(this.state);
          this.clearHighlights();
          this.renderCoach();
        });
      return;
    }

    const step = getCurrentTutorialStep(this.state);
    if (!step) {
      this.coachEl.style.display = 'none';
      this.coachEl.innerHTML = '';
      return;
    }

    this.coachEl.style.display = 'flex';
    this.coachEl.innerHTML = `
      <div class="tutorial-coach-header">
        <span class="hud-badge tutorial-coach-badge">GUIDED TUTORIAL</span>
        <span class="tutorial-coach-progress">Step ${step.order} / ${TUTORIAL_STEPS.length}</span>
      </div>
      <div class="tutorial-coach-title">${step.title}</div>
      <div class="tutorial-coach-instruction">${step.instruction}</div>
      <div class="tutorial-coach-hint">${step.hint}</div>
      <div class="hud-btn-row" style="margin-top: 4px;">
        <button type="button" class="hud-btn" data-action="tutorial-skip">
          Skip Step
        </button>
        <button type="button" class="hud-btn" data-action="tutorial-dismiss">
          Dismiss
        </button>
      </div>
    `;

    this.coachEl
      .querySelector<HTMLButtonElement>('[data-action="tutorial-skip"]')
      ?.addEventListener('click', () => {
        this.state = skipCurrentTutorialStep(this.state);
        if (this.state.status === 'completed') {
          this.clearHighlights();
        }
        this.renderCoach();
      });

    this.coachEl
      .querySelector<HTMLButtonElement>('[data-action="tutorial-dismiss"]')
      ?.addEventListener('click', () => {
        this.state = dismissTutorial(this.state);
        this.clearHighlights();
        this.renderCoach();
      });
  }
}