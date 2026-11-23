import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../../shared/sim/gameSimulation.ts';
import type { ProjectedPlanetView } from '../../../shared/sim/playerIntel.ts';
import { applyGhostIntelMaterial } from '../ghostIntelMaterial.ts';
import { createLivingPlanetGroup } from '../planetFactory.ts';

describe('Fog-of-war rendering helpers', () => {
  it('applyGhostIntelMaterial clones materials, dims opacity/depthWrite, and hides shield bubbles', () => {
    const sharedMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.0,
      opacity: 1.0,
      transparent: false,
      depthWrite: true,
    });
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), sharedMat);
    const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(3), sharedMat);
    shieldMesh.name = 'aegis_shield_bubble';

    const root = new THREE.Group();
    root.add(bodyMesh, shieldMesh);

    applyGhostIntelMaterial(root);

    expect(shieldMesh.visible).toBe(false);
    expect(bodyMesh.material).not.toBe(sharedMat);
    const ghostMat = bodyMesh.material as THREE.MeshStandardMaterial;
    expect(ghostMat.transparent).toBe(true);
    expect(ghostMat.opacity).toBeLessThanOrEqual(0.38);
    expect(ghostMat.depthWrite).toBe(false);

    expect(sharedMat.transparent).toBe(false);
    expect(sharedMat.opacity).toBe(1.0);
    expect(sharedMat.depthWrite).toBe(true);
  });

  it('AnimatedPlanetHandle.syncStructures accepts ProjectedPlanetView ghost/live and supports pickOrbitalStructure', () => {
    const sim = new GameSimulation('blitz_skirmish');
    const planet = sim.galaxy.systems[0]!.planets[0]!;
    const handle = createLivingPlanetGroup(planet, new THREE.Vector3(1, 0.5, -1).normalize());

    const ghostView: ProjectedPlanetView = {
      planet,
      visibility: 'last_known',
      ownerId: 'player_2',
      observedAtSeconds: 42,
      structures: [
        {
          kind: 'ghost',
          id: 'ghost_cnc_1',
          structureId: 'command_and_control',
          ownerId: 'player_2',
          planetId: planet.id,
          primarySlotIndex: 0,
          occupiedSlots: [0, 1],
          isComplete: true,
          buildProgressSeconds: 0,
          totalBuildTimeSeconds: 0,
          shields: 3000,
          hull: 8000,
          observedAtSeconds: 42,
        },
      ],
    };

    handle.syncStructures(ghostView);
    handle.rootGroup.updateMatrixWorld(true);

    let taggedMesh: THREE.Mesh | null = null;
    handle.rootGroup.traverse((obj) => {
      if (!taggedMesh && obj instanceof THREE.Mesh && obj.userData.orbitalStructureId === 'ghost_cnc_1') {
        taggedMesh = obj;
      }
    });
    expect(taggedMesh).not.toBeNull();

    const targetWorld = new THREE.Vector3();
    taggedMesh!.getWorldPosition(targetWorld);
    const origin = targetWorld.clone().add(new THREE.Vector3(0, 50, 0));
    const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0));

    const picked = handle.pickOrbitalStructure(raycaster);
    expect(picked).not.toBeNull();
    expect(picked?.structureId).toBe('ghost_cnc_1');

    handle.dispose();
  });
});
