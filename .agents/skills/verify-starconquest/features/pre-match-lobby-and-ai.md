# Pre-Match Lobby & AI Opponents

Players configure matches from the Main Menu setup screens (`SinglePlayerSetup`, `HostRoomLobby`, `JoinRoomLobby`) or launch the 8-step Guided Tutorial directly from the Main Menu. During a match, `LobbyController` stays mounted in `.hud-top-right-slot` to display King of the Hill and Victory/Defeat banners (and remains reachable from the tutorial-complete coach button until Phase 5).

## Sub-features

- `preset-and-slot-config`: Clicking `[data-lobby-preset="tutorial"|"blitz_skirmish"|"standard_tactical"|"grand_conquest"]`, `[data-lobby-slot="player_1..4"][data-lobby-role="human"|"ai"|"empty"]`, and `[data-lobby-slot="player_1..4"][data-lobby-difficulty="cadet"|"standard"|"admiral"]` updates the draft match configuration (`tutorial` defaults to 1 Human + 1 `cadet` AI + 2 Empty sectors).
- `guided-tutorial-coach`: Launching Guided Tutorial from the Main Menu starts `tutorial` and displays `[data-hud-panel="tutorial-tracker"]` inside `.hud-top-right-slot` with 8 auto-advancing steps (including Harvester & Economy onboarding), defensive Cadet AI until provoked, `.tutorial-highlight` target pulses, `[data-action="tutorial-skip"]`, and `[data-action="tutorial-dismiss"]`.
- `match-launch-reset`: Clicking `[data-action="launch-match"]` resets the authoritative simulation and 3D scene to the draft preset and slot configuration, updates `#hud-lobby-preset-badge` and `#hud-match-status-val`, and leaves empty-slot starter homeworlds unclaimed and colonizable.
- `koth-and-outcome-telemetry`: Launching `grand_conquest` displays `[data-hud-panel="koth-telemetry-banner"]` with the Nexus Super-Earth holder and `10:00` countdown timer, and winning or losing displays `[data-hud-panel="match-outcome-banner"]` with `[data-action="open-lobby-from-outcome"]` and `[data-action="dismiss-outcome-banner"]`.
- `p2p-room-hosting-and-join`: Clicking `[data-action="host-p2p-room"]` starts a WebRTC P2P room with a `SC-XXXX` Room Code (`[data-p2p-room-code]`), allows assigning connected peers to human slots (`[data-p2p-assign-slot]`, `[data-p2p-unassign-slot]`), and lets a second tab join via `[data-p2p-join-input]` + `[data-action="join-p2p-room"]` (or manual signal token) and launch into a Fog-of-War-isolated live match.

## How to get to it (user POV)

- Main Menu setup screens (`Start Single Player`, `Host Room`, `Connect to Room`, `Guided Tutorial`).
- Match outcome banner `[data-action="open-lobby-from-outcome"]` button (`Configure New Match`) when a match concludes, or `[data-action="quit-to-main-menu"]` in `.hud-top-bar`.

## Driving it with browser

Preconditions: Fresh reload of `http://127.0.0.1:5179/` on the Main Menu.

1. **Open Single Player Setup**:
   - Action: Click `Start Single Player` on the Main Menu.
   - Observable result: Setup screen displays 4 preset cards (`tutorial`, `blitz_skirmish`, `standard_tactical`, `grand_conquest`) and 4 player slot rows (`player_1..4`).
2. **Select Grand Conquest, Admiral AI, and an Empty Sector**:
   - Action: Click `[data-lobby-preset="grand_conquest"]`, click `[data-lobby-slot="player_2"][data-lobby-difficulty="admiral"]`, and click `[data-lobby-slot="player_4"][data-lobby-role="empty"]`.
   - Observable result: `[data-lobby-preset="grand_conquest"]` has class `selected`, `player_2` difficulty `Admiral` has class `active`, and `player_4` role `Empty` has class `active`.
3. **Launch the configured match**:
   - Action: Click `[data-action="launch-match"]`.
   - Observable result: `[data-hud-panel="lobby-drawer"]` closes (`display: none`), `#hud-lobby-preset-badge` reads `Grand Conquest`, `#hud-match-status-val` reads `3/3 C&C`, `[data-hud-panel="koth-telemetry-banner"]` is visible (`display: flex`) showing `KING OF THE HILL • NEXUS SUPER-EARTH`, and `.hud-status-msg` confirms `Launched Grand Conquest`.
4. **Verify empty-slot starter system is unclaimed and AI opponents build structures**:
   - Action: Click `[data-speed="4"]`, wait 6 seconds for AI evaluation ticks, then click `[data-system-id="system_starter_4"]` in the Galaxy HUD section.
   - Observable result: `Sector 4 Prime` in `system_starter_4` displays `Unclaimed` with `0/10 slots` (no starting Command & Control), while `player_2` and `player_3` construct orbital Refineries in their starter systems.
5. **Host & Join a 2-tab WebRTC P2P Room**:
   - Action: On Tab 1, open Lobby and click `[data-action="host-p2p-room"]`, then read `[data-p2p-room-code]`. On Tab 2, open Lobby, enter the Room Code in `[data-p2p-join-input]`, and click `[data-action="join-p2p-room"]`. On Tab 1, assign the connected peer to `player_2` (`[data-lobby-slot="player_2"][data-lobby-role="human"]` then `[data-p2p-assign-slot="player_2"]`) and click `[data-action="launch-match"]`.
   - Observable result: Tab 1 shows `1 / 3 PEERS`, Tab 2 transitions `[data-p2p-status]` to `CONNECTED TO ROOM SC-XXXX`, and upon launch both tabs close the Lobby and enter the live match with per-player Fog of War (`Starter System 2` owned by Tab 2, `Starter System 1` `UNEXPLORED` to Tab 2).

## Gotchas

- Changing preset or slot buttons inside `[data-hud-panel="lobby-drawer"]` only edits the draft configuration until `[data-action="launch-match"]` is clicked; clicking `[data-action="close-lobby"]` discards draft edits and keeps the current match running.
- In `grand_conquest`, the 600-second King of the Hill timer on `system_central_hub_super_earth` only begins advancing after a `Planetary Outpost` finishes its `25s` construction on Nexus Super-Earth, and pauses whenever a hostile combat ship is within `320` units.

