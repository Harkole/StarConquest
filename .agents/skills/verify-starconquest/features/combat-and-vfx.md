# Combat & VFX

Combat & VFX resolves 5-class Shield vs. Hull RPS engagements, Fleet Stances (`Aggressive`, `Hold the Line`, `Passive`), Carrier and Logistics Hub organic Fighter wings, active turret target tracking, HDR weapon tracers/salvos, dynamic impact-only Shield ripples, hull explosions, and dynamic ambient ↔ `"combat"` music switching (*Iron Horizon*).

## Sub-features

- `combat-stances` enforces `Aggressive` (pursue hostiles in-system), `Hold the Line` (fire in range without chasing), and `Passive` (never fire or chase).
- `combat-vfx-beams-and-shields` renders HDR weapon beams (`fighter`, `pd`, `medium`, `heavy`, `siege`), flashes translucent Shield impact ripples only when shields absorb damage, and spawns expanding hull explosions on destruction.
- `combat-turret-tracking` rotates ship and Defence Tower `turretPivots` toward live targets while engaging.
- `combat-carrier-hub-fighters` auto-launches up to 4 tethered Fighter squadrons from completed Carriers and Logistics Hubs.
- `combat-music-switch` switches the soundtrack to `"combat"` (*Iron Horizon*) during active engagements and returns to `ambient` after the 14s cooldown.

## How to get to it (user POV)

- Build an Orbital Dockyard, create a Fleet, build Destroyers/Cruisers, and send the fleet through the wormhole into `system_starter_2` (where `player_2`'s Homeworld C&C and Harvester are active) or build an Atlas Logistics Hub to watch organic Fighter wings launch automatically.

## Driving it with browser

Preconditions:

- StarConquest is healthy at `http://127.0.0.1:5179/` (Doctor passed).

- **Build an Atlas Logistics Hub to verify organic Fighter wings.** Click `[data-action="overview"]`, click `[data-place-deepspace="logistics_hub"]`, and left-click open space on `#app-canvas`. Switch to `[data-speed="4"]` and wait `~6s` for the Hub to reach `Operational`, then `~2s` more for its first tethered Stinger Fighter squadron to launch around the Hub.
- **Engage enemy C&C in Sector 2 (`system_starter_2`).** Build an Orbital Dockyard on Homeworld, create a Fleet with `2` Destroyers, switch to `[data-system-id="system_starter_2"]`, and right-click near `player_2`'s Homeworld so the fleet transits the wormhole and enters weapon range of `player_2`'s C&C.
- **Observe combat VFX & dynamic music.** Confirm glowing weapon beams fire between ships and `player_2`'s C&C, translucent cyan Shield ripples flash on C&C shield hits, and network requests load `/audio/Iron_Horizon.mp3` (`200`/`206`) with `0` console errors.
- **Proof.** Capture a screenshot of active combat beams/shield ripples or launched Hub Fighter wings, network log showing `Iron_Horizon.mp3` (`206`/`200`), and `0` console/WebGL errors.

## Gotchas

- Before Step 5 (AI Opponents), hostile entities live in `system_starter_2`, `system_starter_3`, and `system_starter_4` (each has a rival Homeworld C&C + Harvester), so engaging enemy units requires sending a fleet through the Central Nexus wormhole.
- No static always-on shield bubbles appear on idle ships or structures by design; Shield ripples flash only during active shield hits.
