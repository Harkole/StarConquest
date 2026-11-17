import { PLANET_CLASSES } from '../../shared/config/index.ts';
import type { GalaxyTopology } from '../../shared/sim/galaxy.ts';
import type { SystemSceneManager } from '../renderer/systemSceneManager.ts';
import { NEBULA_PALETTES } from '../shaders/nebulaShaders.ts';

export function mountSystemHud(
  container: HTMLElement,
  galaxy: GalaxyTopology,
  sceneManager: SystemSceneManager,
): void {
  function renderHud(): void {
    const activeSystem = sceneManager.getActiveSystem();
    const paletteInfo = NEBULA_PALETTES[activeSystem.nebulaPalette];

    const systemButtonsHtml = galaxy.systems
      .map((sys) => {
        const isActive = sys.id === activeSystem.id;
        return `<button class="hud-btn ${isActive ? 'active' : ''}" data-system-id="${sys.id}">
          ${sys.name}
          <span class="hud-badge">${sys.isCentralHub ? '12-Slot Hub' : sys.resourceSkew.replace('_', ' ')}</span>
        </button>`;
      })
      .join('');

    const planetButtonsHtml = activeSystem.planets
      .map((planet) => {
        const pClass = PLANET_CLASSES[planet.planetClass];
        const themeLabel = planet.visualTheme.replace('_', ' ');
        return `<button class="hud-planet-card" data-planet-id="${planet.id}">
          <div class="planet-card-title">${planet.name}</div>
          <div class="planet-card-meta">${pClass.displayName} • <strong>${planet.orbitalSlots} Slots</strong></div>
          <div class="planet-card-theme">Biome: ${themeLabel}</div>
        </button>`;
      })
      .join('');

    const wormholesHtml = sceneManager
      .getActiveWormholes()
      .map((wh) => {
        const destSys = galaxy.systems.find((s) => s.id === wh.destinationSystemId);
        const destName = destSys?.name ?? wh.destinationSystemId;
        const isOpen = wh.isOpen();
        return `<button class="hud-btn ${isOpen ? 'active' : ''}" data-wormhole-id="${wh.wormholeId}">
          Gateway → ${destName}
          <span class="hud-badge">${isOpen ? 'OPEN VORTEX' : 'DORMANT (CLICK TO OPEN)'}</span>
        </button>`;
      })
      .join('');

    container.innerHTML = `
      <div class="hud-header">
        <div>
          <h1>StarConquest — Orbital Sector View</h1>
          <p class="hud-subtitle">${activeSystem.name} • ${paletteInfo.displayName}</p>
        </div>
        <button class="hud-btn overview-btn" data-action="overview">System Overview</button>
      </div>

      <div class="hud-section">
        <div class="hud-label">5-System Hub & Spoke Galaxy</div>
        <div class="hud-btn-row">${systemButtonsHtml}</div>
      </div>

      <div class="hud-section">
        <div class="hud-label">Planetary Orbital Rings (Click to Focus Camera)</div>
        <div class="hud-planet-row">${planetButtonsHtml}</div>
      </div>

      <div class="hud-section">
        <div class="hud-label">Wormhole Gateways (Dormant Until Ship Approaches — Click to Focus & Trigger Opening)</div>
        <div class="hud-btn-row">${wormholesHtml}</div>
      </div>

      <div class="hud-controls-hint">
        <span><strong>Left-Drag / WASD:</strong> Pan</span>
        <span><strong>Right-Drag:</strong> Orbit / Tilt</span>
        <span><strong>Scroll:</strong> Zoom (Inspect Clouds & Lava)</span>
      </div>
    `;

    container.querySelectorAll<HTMLButtonElement>('[data-system-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sysId = btn.dataset.systemId;
        if (sysId) {
          sceneManager.loadSystem(sysId);
          renderHud();
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-planet-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const planetId = btn.dataset.planetId;
        if (planetId) {
          sceneManager.focusPlanet(planetId);
        }
      });
    });

    container.querySelectorAll<HTMLButtonElement>('[data-wormhole-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wormholeId = btn.dataset.wormholeId;
        if (wormholeId) {
          sceneManager.focusAndToggleWormhole(wormholeId);
          renderHud();
        }
      });
    });

    const overviewBtn = container.querySelector<HTMLButtonElement>('[data-action="overview"]');
    overviewBtn?.addEventListener('click', () => {
      sceneManager.focusSystemOverview();
    });
  }

  renderHud();
}
