import { describe, expect, it } from 'vitest';
import { LocalSimAdapter } from '../../net/localSimAdapter.ts';
import {
  buildLeftOutlinerModel,
  renderLeftOutlinerHtml,
} from '../leftOutlinerView.ts';

describe('leftOutlinerView', () => {
  it('lists every galaxy system once with exactly one active and renders system, planet, and create-fleet selectors', () => {
    const adapter = new LocalSimAdapter('standard_tactical');
    const sim = adapter.simulation;
    const galaxy = sim.galaxy;
    const activeSystem = galaxy.systems.find((s) => s.id === 'system_starter_1')!;

    const model = buildLeftOutlinerModel(sim, {
      galaxy,
      playerId: 'player_1',
      activeSystem,
      selectedPlanetId: activeSystem.planets[0]!.id,
      selectedFleetId: null,
      selectedHarvesterId: null,
      wormholeStates: [
        {
          id: 'wh_1',
          destinationSystemId: 'system_central_hub',
          isOpen: false,
        },
      ],
      pendingFleetOrder: null,
    });

    expect(model.systems.map((s) => s.id)).toEqual(galaxy.systems.map((s) => s.id));
    expect(model.systems.filter((s) => s.isActive)).toHaveLength(1);
    expect(model.systems.find((s) => s.isActive)?.id).toBe(activeSystem.id);
    expect(model.planets.map((p) => p.id)).toEqual(
      activeSystem.planets.map((p) => p.id),
    );
    expect(model.fleets).toHaveLength(0);

    const html = renderLeftOutlinerHtml(model);
    for (const sys of galaxy.systems) {
      expect(html).toContain(`data-system-id="${sys.id}"`);
    }
    for (const planet of activeSystem.planets) {
      expect(html).toContain(`data-planet-id="${planet.id}"`);
    }
    expect(html).toContain('data-action="create-fleet"');
    expect(html).toContain('data-hud-field="system-reserves-ore"');
    expect(html).toContain('data-hud-field="system-reserves-crystal"');
    expect(html).toContain('data-hud-field="system-reserves-inner"');
    expect(html).not.toContain('data-select-fleet=');
  });

  it('renders a data-select-fleet row after submitting CREATE_FLEET through the adapter', () => {
    const adapter = new LocalSimAdapter('standard_tactical');
    const sim = adapter.simulation;
    const galaxy = sim.galaxy;
    const activeSystem = galaxy.systems.find((s) => s.id === 'system_starter_1')!;

    const createRes = adapter.submitPlayerCommand({
      type: 'CREATE_FLEET',
      playerId: 'player_1',
      rallySystemId: activeSystem.id,
      rallyPosition: { x: 250, z: 180 },
      stance: 'aggressive',
      autoResupply: true,
    });
    expect(createRes.ok).toBe(true);

    const fleets = sim.getFleetsForPlayer('player_1');
    expect(fleets).toHaveLength(1);
    const createdFleet = fleets[0]!;

    const model = buildLeftOutlinerModel(sim, {
      galaxy,
      playerId: 'player_1',
      activeSystem,
      selectedPlanetId: activeSystem.planets[0]!.id,
      selectedFleetId: createdFleet.id,
      selectedHarvesterId: null,
      wormholeStates: [],
      pendingFleetOrder: null,
    });

    expect(model.fleets).toHaveLength(1);
    expect(model.fleets[0]!.id).toBe(createdFleet.id);
    expect(model.fleets[0]!.isSelected).toBe(true);

    const html = renderLeftOutlinerHtml(model);
    expect(html).toContain(`data-select-fleet="${createdFleet.id}"`);
    expect(html).toContain(createdFleet.name);
  });
});
