# Orbital Ring Builder

The Orbital Ring Builder lets a player inspect occupied orbital slots around the selected planet, construct 1-slot and 2-slot orbital stations on empty slots, queue Harvesters and set Mining Focus on C&C or Refineries, and enable or pause Fleet Building on Orbital Dockyards.

## Sub-features

- `orb-slot-select` selects any orbital slot pill and displays either build options (empty) or structure controls (occupied).
- `orb-build-refinery` constructs a 1-slot Orbital Refinery, deducts Ore/Crystal, completes over time, and spawns a free Harvester.
- `orb-build-dockyard` constructs a 2-slot Titan Orbital Dockyard spanning two adjacent slots and shows the simplified description plus `Fleet Building` toggle.
- `orb-queue-harvester` queues a paid Harvester from C&C or Refinery and updates `#econ-harvesters-val` on completion.
- `orb-mining-focus` switches C&C or Refinery mining focus between `Auto (Balanced)`, `Ore Only`, and `Crystal Only`.
- `orb-cancel-decommission` cancels an under-construction orbital platform (`[data-cancel-orbital]`) for a 100% refund or decommissions a completed non-C&C orbital platform (`[data-decommission-orbital]`) to reclaim slots and recover 50% salvage.

## How to get to it (user POV)

- Click any orbital slot button (`Slot 1`–`Slot 10` on the Homeworld) in the **Orbital Ring Builder** section of `#hud-overlay`.
- Click a structure build card (`Orbital Refinery`, `Orbital Dockyard`, `C&C Tech & Specialization Module`, `Heavy Orbital Defense Platform`, or `Planetary Outpost` on unclaimed planets).
- Click an occupied C&C/Refinery slot to access `+ Queue Harvester` and `MINING FOCUS` buttons, or an occupied Orbital Dockyard slot to toggle `FLEET BUILDING`.

## Driving it with browser

Preconditions:

- StarConquest is healthy at `http://127.0.0.1:5179/` (Doctor passed).
- Player is in `system_starter_1` with Homeworld selected (slots `0` and `1` occupied by Command & Control).

- **Accelerate simulation.** Click `[data-speed="4"]`. The `4x` button gains class `active`.
- **Inspect C&C & Mining Focus.** Click `[data-slot-index="0"]`, then click `[data-set-focus="ore"]`. The `Ore Only` button becomes `active` and `.hud-status-msg` reads `Platform mining focus set to ORE`.
- **Queue a Harvester.** Record `#econ-harvesters-val` (initially `1`) and `#econ-ore-val`. Click `[data-action="spawn-harvester"]`. `.hud-status-msg` confirms deployment, `#econ-ore-val` drops by `100`, and a build queue pill appears; after `~2.5s` at `4x`, `#econ-harvesters-val` increments to `2`.
- **Build 1-slot Refinery.** Click empty slot `[data-slot-index="2"]` and click `[data-build-struct="refinery"]`. `.hud-status-msg` confirms construction on Slot 3, `[data-slot-pct="2"]` counts up from `0%`, and after `~5.5s` at `4x` it reaches `Ready` while `#econ-harvesters-val` increases by `+1` (free Refinery Harvester).
- **Build 2-slot Orbital Dockyard.** Click empty slot `[data-slot-index="3"]` and click `[data-build-struct="orbital_dockyard"]`. Both slots `3` and `4` show `S4: Orbital (...)` / `S5: Orbital (...)`; after completion (`7.5s` at `4x` for a `30s` build), selecting `[data-slot-index="3"]` displays the dual-bay description and `[data-toggle-dockyard-fleet-building]` reading `Enabled (Supplying Fleets)`.
- **Toggle Dockyard Fleet Building.** Click `[data-toggle-dockyard-fleet-building]`. Button text changes to `Disabled (Paused)` and loses `active`; click again to restore `Enabled (Supplying Fleets)`.
- **Proof.** Capture a screenshot showing the operational Dockyard on the Homeworld orbital ring and the simplified Dockyard HUD panel, plus before/after Ore, Harvester count, and console error count (`0`).

## Gotchas

- `Command & Control` occupies slots `0` and `1` on match start; clicking `[data-slot-index="0"]` or `[data-slot-index="1"]` inspects C&C rather than showing empty build cards.
- 2-slot buildings (`orbital_dockyard`, `heavy_defense_platform`) require at least one adjacent empty slot (`next` or `prev` with wrap-around). Selecting an isolated single empty slot between two occupied slots disables or rejects the build with a clear `.hud-status-msg`.
- On unclaimed planets (`ownerId === null`), every build card except `planetary_outpost` is disabled until an Outpost is placed.
