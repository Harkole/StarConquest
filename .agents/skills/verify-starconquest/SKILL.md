---
name: verify-starconquest
description: "Drive the live StarConquest 3D browser RTS (Three.js WebGL canvas + HTML tactical HUD) like a real player to prove gameplay, UI, 3D rendering, and audio behavior end-to-end. Use whenever verifying a StarConquest feature, bug fix, or visual/HUD change before declaring it done."
---

# Verify StarConquest

StarConquest is a browser-based 3D space RTS (`#app-canvas` WebGL scene + `#hud-root` tactical HUD) booting on a static `MainMenu` screen (`#app-canvas` hidden until a match starts) and running a deterministic in-browser simulation (`LocalSimAdapter('standard_tactical')`). Every page load starts cleanly with zero external backend, database, or auth dependencies.

Read [features/README.md](./features/README.md) first, then follow the matching feature recipe.

## Launch

Always start an isolated Vite dev server on a dedicated verification port (default `5179`, never `5173`) so you never collide with or mutate a developer's active session.

- **Windows / Antigravity sandbox rule:** A server started inside the sandbox cannot be reached by the `browser` subagent or subsequent shell commands. Start Vite with `BypassSandbox: true` and `IsDaemon: true` via `run_command`, and record the returned `TaskId` for Cleanup:

```pwsh
npx vite --host 127.0.0.1 --port 5179 --strictPort
```

- **Ready check:** Wait for Vite stdout to print `Local:   http://127.0.0.1:5179/` (typically `< 2s`). Usable readiness during an active match means the page renders `#app-canvas` with non-zero dimensions, `#hud-root` renders `.hud-top-bar`, `#econ-ore-val` shows a positive number (starting Ore), and `#econ-harvesters-val` shows `1`.
- **Production subpath check (optional, for GitHub Pages / asset path fixes):** Run `npm run build`, then launch `npx vite preview --host 127.0.0.1 --port 5180 --strictPort` (`BypassSandbox: true`, `IsDaemon: true`) and open `http://127.0.0.1:5180/StarConquest/`.
- **Isolation:** Multiple Vite instances can run side by side on distinct `--port` values with zero shared state. Never drive an existing server on `5173`.

## Doctor

Run this read-only check before driving any feature (and anytime something looks wrong):

1. Confirm the daemon task from Launch is still running (`manage_task` with `Action: "status"` and your recorded `TaskId`) and listening on `127.0.0.1:5179`.
2. In the `browser` subagent, navigate to `http://127.0.0.1:5179/` and verify all five signals (requires Google Chrome running with remote debugging enabled at `chrome://inspect/#remote-debugging`):
   - Document title is `StarConquest — 3D Space RTS`.
   - `#app-canvas` exists with `width > 0` and `height > 0` (WebGL context active).
   - `#hud-root` renders `.hud-top-bar` with `#econ-ore-val > 0`, `#econ-crystal-val > 0`, `#econ-supply-val` (`0 / 30`), and `#econ-harvesters-val` (`1`).
   - Browser console has `0` uncaught JS errors and `0` WebGL shader compilation errors.
   - Network tab has `0` app/asset `404` responses (including `/audio/*.mp3` — note `206 Partial Content` on `.mp3` is normal range streaming, and a `404` on `/favicon.ico` is benign).
   - Note: if `evaluate_script` is disabled by policy, verify all Doctor and feature assertions using a11y snapshots, console/network inspection, and viewport screenshots.

If any signal fails, stop, capture the console/network error as evidence, and fix the broken baseline before driving features.

## Drive

Drive StarConquest through the Antigravity `browser` subagent (`invoke_subagent` with `TypeName: "browser"`). Always prefer stable `data-*` attributes, IDs, and ARIA labels over raw screen coordinates:

- **Main Menu & Lifecycle Overlays:** `[data-app-screen="main_menu"|"single_player_setup"|"host_room_lobby"|"join_room_lobby"]`, `[data-menu-action="launch-tutorial"|"open-single-player"|"open-host-room"|"open-join-room"|"launch-battle-sim"|"open-feedback"|"start-match"|"back-to-main"]`, `[data-action="open-pause-menu"]`, `[data-app-overlay="pause_menu"|"match_outcome"]`, `[data-overlay-action="resume-match"|"restart-match"|"toggle-music"|"rematch"|"quit-to-main-menu"]`.
- **Top Economy & Control Bar:** `#econ-ore-val`, `#econ-crystal-val`, `#econ-supply-val`, `#econ-harvesters-val`, `[data-speed="1"]`, `[data-speed="2"]`, `[data-speed="4"]`, `[data-action="toggle-music"]` (ARIA label `"Mute ambient music"` / `"Unmute ambient music (restarts from beginning)"`), `[data-action="open-pause-menu"]`.
- **Quick Actions Dock (`.hud-quick-dock`):** `[data-place-deepspace="logistics_hub"|"point_defence_tower"|"hull_breaker_tower"]`, `[data-action="cancel-deepspace"]`, `[data-action="toggle-hub-mining"]`, `[data-action="overview"]`.
- **Galaxy & Camera Navigation (`.hud-left-outliner`):** `[data-system-id="system_starter_1"]` .. `[data-system-id="system_central_hub"]`, `[data-planet-id]`, `[data-wormhole-id]`.
- **Contextual Bottom Inspector (`.hud-bottom-inspector`):** Shows only the active entity (`[data-inspector-kind="planet"|"fleet"|"deep_space"|"none"]` or `.harvester-telemetry-card`), collapsing to a hint pill on empty selection:
  - **Orbital Ring Builder:** `[data-slot-index="0"]` .. `[data-slot-index="9"]`, `[data-build-struct="refinery"|"orbital_dockyard"|"tech_module"|"heavy_defense_platform"|"planetary_outpost"]`, `[data-action="spawn-harvester"]`, `[data-set-focus="auto"|"ore"|"crystal"]`, `[data-toggle-dockyard-fleet-building]`, `[data-hud-field="struct-status"]`, `.hud-status-msg`.
  - **Fleet Command:** `[data-action="create-fleet"]`, `[data-action="cancel-fleet-order"]`, `[data-select-fleet]` in `.hud-left-outliner`, plus stacked hull cards `[data-fleet-hull-card="destroyer"|"cruiser"|"carrier"|"dreadnought"]`, `[data-fleet-focus]`, `[data-fleet-inc=...]`, `[data-fleet-dec=...]`, `[data-fleet-resupply]`, `[data-fleet-stance="aggressive"|"hold_the_line"|"passive"]`, `[data-fleet-patrol]`, `[data-fleet-flee]`, `[data-fleet-split]`, `[data-fleet-merge-src]`, `[data-fleet-disband]`, `[data-action="clear-selection"]` in `.hud-bottom-inspector`.
  - **Fleet Battle Simulator:** Launched from `MainMenu` (`[data-menu-action="launch-battle-sim"]`), `[data-action="toggle-battle-sim"]`, `[data-sim-inc]` / `[data-sim-dec]` (with `[data-sim-side="friendly"|"hostile"]`), `[data-action="launch-battle-sim"]`, `[data-action="clear-battle-sim"]`, `[data-action="exit-battle-sim"]`, `[data-action="dismiss-battle-stats"]`.
- **3D Canvas (`#app-canvas`):** Left-click open canvas space away from `#hud-root` perimeter panels (e.g. `x ≈ 55%` of viewport width, `y ≈ 35%` of viewport height) when placing deep-space structures or fleet rally/patrol points. Short right-click (`<= 5px` drag) moves the selected fleet; right-drag orbits; left-drag or `WASD` pans; wheel zooms.
- **Speed acceleration:** Click `[data-speed="4"]` before waiting on construction or ship build timers so 12s–30s builds complete in 3s–7.5s of wall-clock time.

## Evidence

Save every proof artifact under the conversation's scratch directory (outside tracked git files) so cleanup never deletes evidence and `git status` stays clean:

- **Proof path:** `<appDataDir>/brain/<conversation-id>/scratch/verify-starconquest/<feature-id>/` (for screenshots captured by the `browser` subagent, record the exact saved screenshot paths and DOM/console readouts in a brief `proof.md` or in the verification summary).
- **Proof standards:**
  - Exercise the real user path (HUD clicks and canvas interactions); never mutate simulation state via devtools globals or skip UI buttons.
  - Capture both the **before/action** state and the **resulting state** (e.g., Ore/Crystal before build → click build → Ore/Crystal deducted + status banner + slot transitions to `Constructing` → after timer, slot shows `Ready` / `Operational`).
  - Verify zero console errors and zero `404` network failures during the run.
  - Record the feature ID, port/URL, and any entry points exercised or skipped.

## Cleanup

Tear down only the exact Vite daemon task you started during Launch:

1. Call `manage_task` with `Action: "kill"` and the `TaskId` returned when you started `npx vite --host 127.0.0.1 --port 5179 --strictPort`.
2. Never kill processes globally by name (never `Stop-Process -Name node` or `taskkill /IM node.exe`), as that can terminate unrelated dev servers or tooling.
3. Leave the idle `browser` subagent alive (it costs zero tokens when idle) or close only the verification tab; **never delete** the proof artifacts saved under `scratch/verify-starconquest/`.
4. After teardown, confirm proof artifacts still exist on disk before reporting done.

## Helpers

No extra wrapper scripts are required. Use:
- `run_command` (`BypassSandbox: true`, `IsDaemon: true`) to launch `npx vite --host 127.0.0.1 --port 5179 --strictPort`
- `invoke_subagent` (`TypeName: "browser"`) to run Doctor, drive the feature recipes in [features/](./features/README.md), and capture screenshots/console/DOM proof
- `manage_task` (`Action: "kill"`) to tear down the exact verification server
- `npm test` (Vitest) as a complement for deterministic headless simulation invariants, never as a substitute for live browser verification
