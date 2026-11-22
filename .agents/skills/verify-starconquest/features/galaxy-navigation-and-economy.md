# Galaxy Navigation & Economy

Galaxy Navigation & Economy lets a player switch across all 5 hub-and-spoke star systems, focus planets, wormholes, or System Overview, control simulation speed (`1x`/`2x`/`4x`), toggle cross-system Central Hub mining, and inspect/follow live Harvesters.

## Sub-features

- `nav-system-switch` switches the active 3D star system between the 4 starter systems and the Central Nexus (`system_central_hub`).
- `nav-camera-focus` focuses the camera on any planet, wormhole (focus-only without false transit), or System Overview.
- `econ-speed-controls` switches simulation speed between `1x`, `2x`, and `4x` without breaking live DOM patching.
- `econ-hub-mining` toggles `Mining: Local System` ↔ `Mining: Central Hub` for player Harvesters.
- `econ-harvester-inspect` selects an assigned Harvester from the C&C/Refinery panel, opens the live telemetry card, and pins/unpins camera follow.

## How to get to it (user POV)

- Click any system button in **5-System Hub & Spoke Galaxy** (`[data-system-id]`).
- Click `System Overview` (`[data-action="overview"]`), any planet button (`[data-planet-id]`), or any wormhole button (`[data-wormhole-id]`).
- Click `Mining: Local System` (`[data-action="toggle-hub-mining"]`) or `1x`/`2x`/`4x` (`[data-speed]`) in the top bar.
- Select slot `0` (C&C) and click an assigned Harvester chip (`[data-select-harvester]`) or click a Harvester mesh in 3D space.

## Driving it with browser

Preconditions:

- StarConquest is healthy at `http://127.0.0.1:5179/` (Doctor passed).

- **Switch to Central Nexus & back.** Click `[data-system-id="system_central_hub"]`. The HUD header `<h1>` updates to `StarConquest — Central Nexus`, the subtitle displays `1.6x Enriched Yield`, and 4 wormhole buttons appear. Click `[data-system-id="system_starter_1"]` to return to the Homeworld system.
- **Focus wormhole & System Overview.** Click the first `[data-wormhole-id]` button to pan/focus the camera onto the wormhole vortex without switching systems. Click `[data-action="overview"]` to zoom out to full system view.
- **Toggle speed & Central Hub mining.** Click `[data-speed="4"]` (`4x` becomes `active`). Click `[data-action="toggle-hub-mining"]`. Button becomes `active` and text changes to `Mining: Central Hub`.
- **Inspect & follow Harvester.** Click `[data-slot-index="0"]`, then click `[data-select-harvester]` (`Harvester #1`). The `.hud-harvester-inspector` card appears with live `[data-hud-field="harvester-state"]`, `[data-hud-field="harvester-speed"]`, and `[data-hud-field="harvester-cargo-val"]` updating without recreating the card DOM. Click `[data-action="repin-harvester"]` or `[data-action="deselect-harvester"]` to dismiss.
- **Proof.** Capture screenshots of the Central Nexus view (`1.6x Enriched Yield`) and the live Harvester Telemetry Card in `system_starter_1`, plus `0` console errors.

## Gotchas

- Clicking a wormhole button in the HUD intentionally focuses the camera only; it does not switch systems.
- Pressing `WASD` or left-dragging `#app-canvas` breaks camera follow pin on a selected Harvester (expected behavior; clicking `[data-action="repin-harvester"]` re-pins it).
- Live telemetry patches in-place every `250ms` without rebuilding innerHTML; verify that `[data-hud-field="harvester-cargo-val"]` changes smoothly while the mouse hovers over buttons.
