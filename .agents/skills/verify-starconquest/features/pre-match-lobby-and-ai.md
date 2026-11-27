# Pre-Match Lobby & AI Opponents

Players configure matches from the static 3×2 **Main Menu** and pre-match setup screens (`SinglePlayerSetup`, `HostRoomLobby`, `JoinRoomLobby`) or launch the 8-step Guided Tutorial or Battle Simulator directly. During a match, `Menu (Esc)` / `Escape` opens the **`PauseMenu`** modal overlay (pausing local single-player ticks while keeping P2P multiplayer running), King of the Hill telemetry renders in `.hud-top-right-slot`, and victory/defeat renders a centered **`MatchOutcome`** overlay with `Rematch` and `Return to Main Menu`.

## Sub-features

- `main-menu-3x2-grid`: Main Menu displays 3 explicit rows (`Guided Tutorial` / `Start Single Player` primary, `Host Online Room` / `Join Online Room`, `Battle Simulator` / `Feedback` link to GitHub Issues) with `#app-canvas` hidden until a match starts.
- `single-player-exclusive-human`: In `SinglePlayerSetup`, selecting `Human` on another starter slot moves `YOU` (`localPlayerId`) to that slot and converts the previous Human slot into `AI Bot`, while preserving untouched `AI Bot` difficulties and `Empty` sectors.
- `guided-tutorial-coach`: Clicking `[data-menu-action="launch-tutorial"]` starts `tutorial` and docks `[data-hud-panel="tutorial-tracker"]` inside `.hud-top-right-slot` with 8 auto-advancing steps, `.tutorial-highlight` target pulses, `[data-action="tutorial-skip"]`, and `[data-action="tutorial-dismiss"]`.
- `pause-and-outcome-overlays`: Pressing `Escape` or clicking `[data-action="open-pause-menu"]` opens `[data-app-overlay="pause_menu"]` (`Resume (Esc)`, `Restart Match`, `Mute Music`, `Quit to Main Menu`); winning or losing displays `[data-app-overlay="match_outcome"]` (`Rematch`, `Return to Main Menu`).
- `p2p-room-hosting-and-join`: Opening `Host Online Room` starts a WebRTC P2P room with a `SC-XXXX` Room Code (`[data-p2p-room-code]`), allows assigning connected peers to human slots (`[data-p2p-assign-slot]`, `[data-p2p-unassign-slot]`), and lets a second tab join via `Join Online Room` (`[data-p2p-join-input]` + `[data-action="join-p2p-room"]` or manual signal token).

## How to get to it (user POV)

- Main Menu action cards (`Guided Tutorial`, `Start Single Player`, `Host Online Room`, `Join Online Room`, `Battle Simulator`, `Feedback`).
- In-match `Menu (Esc)` button (`[data-action="open-pause-menu"]`) or `Escape` key for `PauseMenu`, and `Rematch` / `Return to Main Menu` on `MatchOutcome`.

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

