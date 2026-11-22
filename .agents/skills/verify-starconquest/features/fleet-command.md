# Fleet Command

Fleet Command lets a player create a fleet with a 3D rally point, configure desired hull counts built smallest-first across all enabled Orbital Dockyards, control stances and Auto-Resupply, focus the camera on any fleet, issue right-click Move orders, and collapse the Fleet Command panel to save screen space.

## Sub-features

- `fleet-create` places a new fleet rally beacon in 3D space and adds a fleet tab (`Fleet #1`).
- `fleet-template-build` increments desired hull counts (`destroyer`, `cruiser`, `carrier`, `dreadnought`) and triggers parallel dual-bay Dockyard construction smallest-first.
- `fleet-rally-formup` flies every newly spawned ship to the green rally point (not an intermediate sibling position).
- `fleet-stance-resupply` toggles `Aggressive` / `Hold the Line` / `Passive` stances and `Resupply: ON ↻` / `OFF`.
- `fleet-focus-move` jumps camera to the fleet on tab or `Focus` click, and moves the whole fleet on short right-click in 3D space.
- `fleet-panel-collapse` collapses and expands the Fleet Command section via `Collapse ▲` / `Expand ▼`.

## How to get to it (user POV)

- Click `+ Create Fleet (Click 3D Rally)` in the **Fleet Command** section of `#hud-overlay`, then left-click open 3D space on `#app-canvas`.
- Click any fleet tab (`Fleet #1`) or click any combat ship in 3D space to select the entire fleet.
- Use `−`/`+` steppers, `Focus`, `Resupply`, `Aggressive`/`Hold the Line`/`Passive`, `Patrol Route (2 Clicks)`, `Split`, `Merge`, `Disband`, and `Collapse ▲` / `Expand ▼`.

## Driving it with browser

Preconditions:

- StarConquest is healthy at `http://127.0.0.1:5179/` (Doctor passed).
- At least one completed Orbital Dockyard exists on the Homeworld (build one at `4x` speed per [Orbital Ring Builder](./orbital-ring-builder.md)) with `Fleet Building` enabled.

- **Create a fleet.** Click `[data-action="create-fleet"]`. Button text changes to `Click 3D Space for Fleet Rally Point...`. Left-click open 3D space on `#app-canvas` to the right of `#hud-overlay`. A green rally ring appears in 3D space and `[data-select-fleet]` (`Fleet #1`) appears with badge `0/0 ↻`.
- **Configure template & verify dual-bay build.** Click `[data-select-fleet]` if not already selected, then click `[data-fleet-inc="destroyer"]` twice. Badge updates to `0/2 ↻`. Switch to `[data-speed="4"]` and wait `~4s`. Both Destroyers build in parallel in the Titan Dockyard's two dynamic slipways and launch; the fleet tab badge updates to `2/2 ↻`.
- **Verify rally form-up.** Wait `~4s` at `4x` for both Destroyers to fly out. Confirm both ships converge near the green rally beacon in 3D space (not stuck near the dockyard/asteroid belt).
- **Toggle stance & Resupply.** Click `[data-fleet-stance="hold_the_line"]` and `[data-fleet-resupply]`. `Hold the Line` becomes `active`, `Resupply` changes to `OFF`, and the `↻` symbol disappears from the fleet tab badge.
- **Click-to-Focus & right-click Move.** Click `[data-action="overview"]` to pull the camera back, then click `[data-fleet-focus]` (or `[data-select-fleet]`) to jump the camera back to `Fleet #1`. Perform a short right-click (`<= 5px` drag) on open 3D space to order the whole fleet to move.
- **Collapse & expand panel.** Click `[data-action="toggle-fleet-panel"]`. Button text changes to `Expand ▼` and `[data-action="create-fleet"]` is hidden while the header retains `Fleet Command (1)`. Click `[data-action="toggle-fleet-panel"]` again to restore `Collapse ▲`.
- **Proof.** Capture screenshots of the active Fleet Command panel with `2/2` Destroyers formed up at the rally beacon, the collapsed Fleet Command header, and `0` console errors.

## Gotchas

- Clicking `#app-canvas` while the pointer is over `#hud-overlay` hits the HUD instead of placing the rally point; always click open canvas space to the right of the HUD.
- Cruisers require `1` completed Tech Module (`tech_module`), Carriers require `2`, and Dreadnoughts require `3`; incrementing them before Tech Modules exist updates the template count, but Dockyards will hold production until tech/resources/supply are satisfied.
- Right-dragging `> 5px` orbits the camera instead of issuing a fleet Move order; right-click Move requires a short tap (`<= 5px` movement).
