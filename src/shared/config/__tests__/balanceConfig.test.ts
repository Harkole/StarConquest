import { describe, expect, it } from 'vitest';
import {
  DEEP_SPACE_STRUCTURES,
  MATCH_PRESETS,
  ORBITAL_STRUCTURES,
  PLANET_CLASSES,
  SHIP_CLASSES,
  getDefaultSlotsForPreset,
  normalizeMatchSetupConfig,
} from '../index.ts';
import { createFiveSystemGalaxy } from '../../sim/galaxy.ts';

describe('StarConquest Blueprint & Balance Config Invariants', () => {
  it('enforces planet orbital slot capacities (6, 8, 10, 12)', () => {
    expect(PLANET_CLASSES.small.orbitalSlots).toBe(6);
    expect(PLANET_CLASSES.medium.orbitalSlots).toBe(8);
    expect(PLANET_CLASSES.large.orbitalSlots).toBe(10);
    expect(PLANET_CLASSES.super_earth.orbitalSlots).toBe(12);
  });

  it('enforces 1-slot and 2-slot orbital structure costs and Refinery free Harvester rule', () => {
    expect(ORBITAL_STRUCTURES.command_and_control.slotCost).toBe(2);
    expect(ORBITAL_STRUCTURES.command_and_control.uniqueHomeworldOnly).toBe(true);
    expect(ORBITAL_STRUCTURES.orbital_dockyard.slotCost).toBe(2);
    expect(ORBITAL_STRUCTURES.heavy_defense_platform.slotCost).toBe(2);

    expect(ORBITAL_STRUCTURES.planetary_outpost.slotCost).toBe(1);
    expect(ORBITAL_STRUCTURES.refinery.slotCost).toBe(1);
    expect(ORBITAL_STRUCTURES.refinery.spawnsFreeHarvester).toBe(true);
    expect(ORBITAL_STRUCTURES.tech_module.slotCost).toBe(1);
  });

  it('enforces Logistics Hub build radius and Point Defence vs Hull Breaker tower roles', () => {
    const hub = DEEP_SPACE_STRUCTURES.logistics_hub;
    const pd = DEEP_SPACE_STRUCTURES.point_defence_tower;
    const hb = DEEP_SPACE_STRUCTURES.hull_breaker_tower;

    expect(hub.buildRadiusProvided).toBeGreaterThan(0);
    expect(hub.supportsFighterOperations).toBe(true);
    expect(pd.requiresLogisticsHubRadius).toBe(true);
    expect(hb.requiresLogisticsHubRadius).toBe(true);

    expect(pd.weaponTracking).toBeGreaterThan(hb.weaponTracking);
    expect(hb.alphaDamage).toBeGreaterThan(pd.alphaDamage);
  });

  it('enforces Shields vs Hull rules and 5-class RPS ship attributes', () => {
    // Hull-only classes
    expect(SHIP_CLASSES.fighter.hasShields).toBe(false);
    expect(SHIP_CLASSES.fighter.maxShields).toBe(0);
    expect(SHIP_CLASSES.destroyer.hasShields).toBe(false);
    expect(SHIP_CLASSES.destroyer.maxShields).toBe(0);
    expect(SHIP_CLASSES.harvester.hasShields).toBe(false);
    expect(SHIP_CLASSES.harvester.maxShields).toBe(0);

    // Shielded capital classes
    expect(SHIP_CLASSES.cruiser.hasShields).toBe(true);
    expect(SHIP_CLASSES.cruiser.maxShields).toBeGreaterThan(0);
    expect(SHIP_CLASSES.carrier.hasShields).toBe(true);
    expect(SHIP_CLASSES.carrier.maxShields).toBeGreaterThan(0);
    expect(SHIP_CLASSES.dreadnought.hasShields).toBe(true);
    expect(SHIP_CLASSES.dreadnought.maxShields).toBeGreaterThan(0);

    // Fighter rules: requires Carrier/Logistics Hub, shield breaker, dogfight luck RNG
    expect(SHIP_CLASSES.fighter.requiresCarrierOrLogisticsHub).toBe(true);
    expect(SHIP_CLASSES.fighter.dogfightLuckVariance).toBeGreaterThan(0);
    expect(SHIP_CLASSES.fighter.weapons[0]?.shieldDamageMultiplier).toBeGreaterThan(2.0);

    // Carrier supports fighter squadrons
    expect(SHIP_CLASSES.carrier.fighterSquadronCapacity).toBeGreaterThan(0);

    // Speed order: Fighter > Destroyer > Cruiser > Carrier > Dreadnought
    expect(SHIP_CLASSES.fighter.speed).toBeGreaterThan(SHIP_CLASSES.destroyer.speed);
    expect(SHIP_CLASSES.destroyer.speed).toBeGreaterThan(SHIP_CLASSES.cruiser.speed);
    expect(SHIP_CLASSES.cruiser.speed).toBeGreaterThan(SHIP_CLASSES.carrier.speed);
    expect(SHIP_CLASSES.carrier.speed).toBeGreaterThan(SHIP_CLASSES.dreadnought.speed);
  });

  it('generates the 5-system hub-and-spoke galaxy with 4 wormholes and central Super-Earth', () => {
    const galaxy = createFiveSystemGalaxy();
    expect(galaxy.systems).toHaveLength(5);
    expect(galaxy.wormholes).toHaveLength(4);

    const starterSystems = galaxy.systems.filter((s) => !s.isCentralHub);
    const centralHub = galaxy.systems.find((s) => s.isCentralHub);

    expect(starterSystems).toHaveLength(4);
    expect(centralHub).toBeDefined();

    for (const starter of starterSystems) {
      const homeworld = starter.planets.find((p) => p.planetClass === 'large');
      expect(homeworld).toBeDefined();
      expect(homeworld?.orbitalSlots).toBe(10);
    }

    const superEarth = centralHub?.planets.find((p) => p.planetClass === 'super_earth');
    expect(superEarth).toBeDefined();
    expect(superEarth?.orbitalSlots).toBe(12);

    // Ensure systems are spread out so wormholes and planets are far beyond sensor/weapon range
    const maxSensorRange = ORBITAL_STRUCTURES.command_and_control.sensorRange;
    for (const wh of galaxy.wormholes) {
      const starterWormholeDist = Math.hypot(wh.fromPosition.x, wh.fromPosition.z);
      const hubWormholeDist = Math.hypot(wh.toPosition.x, wh.toPosition.z);
      expect(starterWormholeDist).toBeGreaterThan(maxSensorRange * 5);
      expect(hubWormholeDist).toBeGreaterThan(maxSensorRange * 5);
    }
  });

  it('defines all four match presets including tutorial with 1 human, 1 cadet AI, and 2 empty slots', () => {
    expect(MATCH_PRESETS.tutorial.id).toBe('tutorial');
    expect(MATCH_PRESETS.tutorial.displayName).toBe('Guided Tutorial');
    expect(MATCH_PRESETS.tutorial.startingOre).toBe(900);
    expect(MATCH_PRESETS.tutorial.startingCrystal).toBe(450);
    expect(MATCH_PRESETS.tutorial.harvestRateMultiplier).toBe(1.5);
    expect(MATCH_PRESETS.tutorial.fogOfWarMode).toBe('open_occupied_systems');

    const tutorialSlots = getDefaultSlotsForPreset('tutorial');
    expect(tutorialSlots.player_1).toEqual({ kind: 'human' });
    expect(tutorialSlots.player_2).toEqual({ kind: 'ai', difficulty: 'cadet' });
    expect(tutorialSlots.player_3).toEqual({ kind: 'empty' });
    expect(tutorialSlots.player_4).toEqual({ kind: 'empty' });

    expect(normalizeMatchSetupConfig('tutorial').slots).toEqual(tutorialSlots);
    expect(normalizeMatchSetupConfig({ presetId: 'tutorial' }).slots).toEqual(
      tutorialSlots,
    );

    expect(MATCH_PRESETS.blitz_skirmish.fogOfWarMode).toBe('open_occupied_systems');
    expect(MATCH_PRESETS.standard_tactical.fogOfWarMode).toBe('sensor_range');
    expect(MATCH_PRESETS.grand_conquest.centralSuperEarthKingOfTheHillSeconds).toBeGreaterThan(0);
  });
});
