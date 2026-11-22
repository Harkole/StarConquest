# Combat & VFX

Combat & VFX resolves 5-class Shield vs. Hull RPS engagements, Fleet Stances (`Aggressive`, `Hold the Line`, `Passive`), Fleet `Flee` retreat, Fighter close-orbit swarming, weapon LOS & capital broadsiding, Dreadnought Spinal Siege vs. Heavy Turrets, Carrier standoff (`280u`) & sequential 1-at-a-time Fighter rebuild bars, pairwise ship-to-ship separation, 3D Shield/Hull health bars, per-player faction colors, active turret target tracking, HDR weapon tracers/salvos, localized solid-fill Shield impact patches, hull explosions, isolated Void Fleet Battle Simulator with post-battle stats, and smooth ambient ↔ `"combat"` music crossfading (*Iron Horizon*).

## Sub-features

- `combat-stances-and-flee` enforces `Aggressive` (pursue hostiles in-system), `Hold the Line` (fire in range without chasing), `Passive` (never fire or chase), and `Flee` (full individual speed retreat to nearest Logistics Hub, Outpost, or C&C).
- `combat-vfx-beams-and-shields` renders HDR weapon beams (`fighter`, `pd`, `medium`, `heavy`, `siege`), flashes localized solid-fill curved Shield impact patches only when shields absorb damage, and spawns expanding hull explosions on destruction.
- `combat-health-and-rebuild-bars` renders green Hull bars on all ships, blue Shield bars only on shielded ships, and an amber-gold sequential Fighter rebuild bar on Carriers when squadrons are lost.
- `combat-turret-tracking` rotates ship and Defence Tower `turretPivots` toward live targets while engaging, with Dreadnoughts aligning bow-on for Spinal Siege vs. Structures/Carriers/Dreadnoughts and broadsiding for Heavy Turrets.
- `combat-carrier-hub-fighters` keeps 4 ready hangar Fighter squadrons docked when clear, scrambles rapidly on enemy contact (`340u` Carrier / `280u` Hub), holds Carrier standoff (`280u`), docks surviving wings when clear, and rebuilds lost wings 1 at a time (`7s` each).
- `combat-faction-colors` applies distinct per-player armor accents, engine glow, orbital ring colors, and ownership rings/pips (`player_1` Royal Purple, `player_2` Crimson, `player_3` Emerald, `player_4` Solar Gold) across combat ships, Harvesters, and stations.
- `combat-battle-simulator` spawns customizable Friendly vs. Hostile fleets inside the isolated Void system (`system_battle_void`) and displays a post-battle statistics screen with survival rates, damage breakdown, and `Return to Match`.
- `combat-music-switch` smoothly crossfades into `"combat"` (*Iron Horizon*, `1.8s` fade-in) during active engagements and fades back out to `ambient` (`3.0s` fade-out) after the `14s` cooldown.

## How to get to it (user POV)

- Open the **Fleet Battle Simulator** section in the HUD (`Expand ▼`) to spawn any Friendly vs. Hostile fleet immediately inside the isolated Void arena, or build an Orbital Dockyard and send a fleet through the wormhole into `system_starter_2`.

## Driving it with browser

Preconditions:

- StarConquest is healthy at `http://127.0.0.1:5179/` (Doctor passed).

- **Launch a Void Battle Simulator match.** Expand the Fleet Battle Simulator panel, configure Friendly vs. Hostile hulls (e.g. `1` Carrier + `2` Cruisers vs. `1` Dreadnought), and click launch. Confirm the scene switches to the isolated Void system with Purple (`player_1`) vs. Crimson (`player_2`) ships, green Hull + blue Shield overhead bars, Carrier standoff + Fighter orbital swarming, localized Shield impact patches, and post-battle statistics on completion.
- **Verify faction colors across all 4 Starter Systems.** Switch through Starter Systems 1–4 and confirm orbital rings, C&C/Refinery trims, and Harvesters show Purple (System 1), Crimson (System 2), Emerald (System 3), and Solar Gold (System 4).
- **Observe combat VFX & dynamic music.** Confirm network requests load `/audio/Iron_Horizon.mp3` (`200`/`206`) with `0` console errors.
- **Proof.** Capture a screenshot of active Void Battle Simulator combat (beams, shield patches, health bars, faction colors) and post-battle statistics, plus `0` console/WebGL errors.

## Gotchas

- Before Step 5 (AI Opponents), live match hostile entities reside in `system_starter_2`, `system_starter_3`, and `system_starter_4`; use the Fleet Battle Simulator for immediate fleet-vs-fleet combat testing without building up an economy.
- No static always-on shield bubbles appear on idle ships or structures by design; localized Shield impact patches flash only during active shield hits.
