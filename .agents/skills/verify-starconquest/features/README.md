# StarConquest verification map

This directory is the maintained source for verifying user-facing behavior in StarConquest. Read this index before driving the app, then follow the matching feature file.

## Baseline preconditions

- Launch an isolated Vite server at `http://127.0.0.1:5179/` (`npx vite --host 127.0.0.1 --port 5179 --strictPort` with `BypassSandbox: true`, `IsDaemon: true`).
- Run Doctor from [SKILL.md](../SKILL.md): title `StarConquest — 3D Space RTS`, `#app-canvas` active, `#econ-ore-val > 0`, `#econ-harvesters-val === 1`, `0` console errors, `0` `404` responses.
- Match initializes deterministically via `LocalSimAdapter('standard_tactical')` in `system_starter_1` with Homeworld C&C on orbital slots `0` and `1`.
- Never drive a developer's running `5173` instance.

## Driving conventions

- Start each feature recipe from a fresh reload of `http://127.0.0.1:5179/` unless the recipe chains preconditions explicitly.
- Prefer `data-*` attributes, element IDs, and ARIA labels over DOM index or CSS layout positions.
- Click `[data-speed="4"]` whenever waiting on multi-second construction or ship fabrication timers.
- For 3D canvas clicks (rally points, deep-space placement, right-click fleet moves), click open space to the right of `#hud-overlay` (`x ≈ 75%` viewport width, `y ≈ 50%` viewport height) so the HUD does not intercept the pointer event.
- Do not delete proof artifacts during cleanup.

## Proof and skip reporting

- Capture both the user action and the resulting state, not only the final screenshot.
- Browser proof includes before/after DOM telemetry (Ore/Crystal/Supply, slot or fleet badges, status messages), a screenshot showing the 3D scene and HUD, and a `0` console-error / `0` `404` check.
- Record the feature ID and entry points exercised alongside every proof artifact.
- Report any unreachable path with the attempted action and unmet precondition. Do not mark a skipped entry point as verified.

## Feature entry contract

Each feature file begins with an H1 title and one-paragraph summary, followed by exactly four H2 sections in order:

1. `Sub-features` — short IDs with one line per behavior.
2. `How to get to it (user POV)` — every user entry point.
3. `Driving it with browser` — starts with `Preconditions:` and pairs each user action with exact selectors/actions and observable results.
4. `Gotchas` — traps that can waste or invalidate a run.

## Features

- [Orbital Ring Builder](./orbital-ring-builder.md) covers orbital slot selection, 1-slot and 2-slot construction, Harvester queuing, Mining Focus, and the Dockyard Fleet Building toggle.
- [Fleet Command](./fleet-command.md) covers fleet creation, smallest-first template steppers, dual-bay shipyard production, rally form-up, stances, `Flee` retreat, Auto-Resupply, click-to-focus, right-click move, and panel collapse/expand.
- [Deep-Space Installations](./deep-space-installations.md) covers live ghost preview validation, Atlas Logistics Hub placement, spacing rules, and Defence Tower placement inside hub radius.
- [Galaxy Navigation & Economy](./galaxy-navigation-and-economy.md) covers 5-system switching, planet/wormhole/overview camera focus, simulation speed controls, Central Hub mining toggle, and Harvester inspection.
- [Ambient Audio Controls](./ambient-audio-controls.md) covers shuffled MP3 loading, autoplay unlock on first gesture, and speaker mute/unmute state transitions.
- [Combat & VFX](./combat-and-vfx.md) covers 5-class RPS combat, stances, Carrier/Hub organic Fighter wings, active turret tracking, HDR weapon/shield/explosion VFX, the isolated Void Fleet Battle Simulator, and dynamic `"combat"` music switching.
- [Pre-Match Lobby & AI Opponents](./pre-match-lobby-and-ai.md) covers the Match Lobby drawer, preset selection (`tutorial`, `blitz_skirmish`, `standard_tactical`, `grand_conquest`), the 8-step Guided Tutorial coach (`[data-hud-panel="tutorial-tracker"]`), 4-slot Human/AI/Empty configuration, AI difficulty profiles (`cadet`, `standard`, `admiral`), empty-slot unclaimed starter homeworlds, and live King of the Hill / Last C&C Standing victory telemetry.
