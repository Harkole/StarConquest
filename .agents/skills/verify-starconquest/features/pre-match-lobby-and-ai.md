# Pre-Match Lobby & AI Opponents

Players can open the Pre-Match Lobby drawer from the top economy bar to select among Blitz Skirmish, Standard Tactical, and Grand Conquest match presets, configure all four player slots across Human, AI difficulty profiles (Cadet, Standard, Admiral), or Empty colonizable sectors, launch a reset match without reloading the page, and monitor live Last C&C Standing and Grand Conquest King of the Hill victory telemetry.

## Sub-features

- `lobby-drawer-toggle`: Clicking `[data-action="toggle-lobby"]` opens and closes `[data-hud-panel="lobby-drawer"]`, and `[data-action="close-lobby"]` resumes the active match without resetting.
- `preset-and-slot-config`: Clicking `[data-lobby-preset="blitz_skirmish"|"standard_tactical"|"grand_conquest"]`, `[data-lobby-slot="player_1..4"][data-lobby-role="human"|"ai"|"empty"]`, and `[data-lobby-slot="player_1..4"][data-lobby-difficulty="cadet"|"standard"|"admiral"]` updates the draft match configuration.
- `match-launch-reset`: Clicking `[data-action="launch-match"]` resets the authoritative simulation and 3D scene to the draft preset and slot configuration, updates `#hud-lobby-preset-badge` and `#hud-match-status-val`, and leaves empty-slot starter homeworlds unclaimed and colonizable.
- `koth-and-outcome-telemetry`: Launching `grand_conquest` displays `[data-hud-panel="koth-telemetry-banner"]` with the Nexus Super-Earth holder and `10:00` countdown timer, and winning or losing displays `[data-hud-panel="match-outcome-banner"]` with `[data-action="open-lobby-from-outcome"]` and `[data-action="dismiss-outcome-banner"]`.

## How to get to it (user POV)

- Top economy bar `[data-action="toggle-lobby"]` button (`Match Lobby` with preset badge `#hud-lobby-preset-badge`).
- Match outcome banner `[data-action="open-lobby-from-outcome"]` button (`Configure New Match`) when a match concludes.

## Driving it with browser

Preconditions: Fresh reload of `http://127.0.0.1:5179/` passing Doctor checks (`#hud-lobby-preset-badge` shows `Standard Tactical`, `#hud-match-status-val` shows `4/4 C&C`).

1. **Open the Pre-Match Lobby drawer**:
   - Action: Click `[data-action="toggle-lobby"]`.
   - Observable result: `[data-hud-panel="lobby-drawer"]` becomes visible (`display: flex`), showing 3 preset cards (`blitz_skirmish`, `standard_tactical`, `grand_conquest`) and 4 player slot rows (`player_1..4`).
2. **Select Grand Conquest, Admiral AI, and an Empty Sector**:
   - Action: Click `[data-lobby-preset="grand_conquest"]`, click `[data-lobby-slot="player_2"][data-lobby-difficulty="admiral"]`, and click `[data-lobby-slot="player_4"][data-lobby-role="empty"]`.
   - Observable result: `[data-lobby-preset="grand_conquest"]` has class `selected`, `player_2` difficulty `Admiral` has class `active`, and `player_4` role `Empty` has class `active`.
3. **Launch the configured match**:
   - Action: Click `[data-action="launch-match"]`.
   - Observable result: `[data-hud-panel="lobby-drawer"]` closes (`display: none`), `#hud-lobby-preset-badge` reads `Grand Conquest`, `#hud-match-status-val` reads `3/3 C&C`, `[data-hud-panel="koth-telemetry-banner"]` is visible (`display: flex`) showing `KING OF THE HILL • NEXUS SUPER-EARTH`, and `.hud-status-msg` confirms `Launched Grand Conquest`.
4. **Verify empty-slot starter system is unclaimed and AI opponents build structures**:
   - Action: Click `[data-speed="4"]`, wait 6 seconds for AI evaluation ticks, then click `[data-system-id="system_starter_4"]` in the Galaxy HUD section.
   - Observable result: `Sector 4 Prime` in `system_starter_4` displays `Unclaimed` with `0/10 slots` (no starting Command & Control), while `player_2` and `player_3` construct orbital Refineries in their starter systems.

## Gotchas

- Changing preset or slot buttons inside `[data-hud-panel="lobby-drawer"]` only edits the draft configuration until `[data-action="launch-match"]` is clicked; clicking `[data-action="close-lobby"]` discards draft edits and keeps the current match running.
- In `grand_conquest`, the 600-second King of the Hill timer on `system_central_hub_super_earth` only begins advancing after a `Planetary Outpost` finishes its `25s` construction on Nexus Super-Earth, and pauses whenever a hostile combat ship is within `320` units.

