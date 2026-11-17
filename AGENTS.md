# StarConquest — Agent Guidelines & Architecture Rules

This file defines the architectural, visual, and gameplay invariants for **StarConquest**.

## 0. Mandatory Blueprint Rule (`README.md` is the Source of Truth)

* **[README.md](./README.md) is the canonical blueprint and single source of truth** for the entire game, and **[docs/artstyle.md](./docs/artstyle.md) is the canonical 3D art style and model construction guide** for all ships and orbital platforms.
* **Always Reference `README.md` & `docs/artstyle.md` First**: Before designing, implementing, or modifying any game system, UI, shader, 3D model, or network layer, the agent **must** read [README.md](./README.md) (and [docs/artstyle.md](./docs/artstyle.md) when working on 3D ship or platform models) to verify alignment with the blueprint.
* **Always Keep `README.md` Up to Date**: Whenever the user and agent agree on a new design choice, balance adjustment, build option, or architectural change, the agent **must** update [README.md](./README.md) in the same turn so it never drifts out of sync with the project.

---

## 1. Selected Tech Stack

To deliver high-end space visuals in the browser while supporting both **instant 100% local vs. AI play** and **4-player online multiplayer**, this project uses:

* **Language**: **TypeScript (Strict Mode)** across the entire stack (shared simulation core, 3D browser client, AI controllers, and networking adapters).
* **3D Rendering Engine**: **Three.js** with **Custom GLSL Shaders** and **`postprocessing`** (Selective HDR Bloom, Tone Mapping, SMAA).
  * *Why Three.js*: Gives full low-level control over custom planetary shaders (drifting clouds, atmospheric Fresnel glow, animated lava fissures, procedural deep-space nebulae) and high-performance `InstancedMesh` rendering for asteroid belts, projectiles, and fighter swarms.
* **Bundler & Dev Tooling**: **Vite** (with GLSL shader import support) for fast HMR and asset bundling, plus **Vitest** for unit and headless balance testing.
* **UI Overlay**: Decoupled HTML/CSS/TypeScript tactical HUD layered over the Three.js canvas (keeping 2D UI crisp and separated from 3D WebGL passes).
* **Networking & Multiplayer**: **Transport-Agnostic Authoritative Simulation** supporting:
  1. **Purely Local Execution (`LocalSimAdapter`)**: Runs 100% inside the user's browser (or Web Worker) with zero network/server dependency for single-player vs. AI matches.
  2. **Player-Hosted P2P (`WebRTCPeerAdapter`)**: One player's browser acts as the authoritative listen-server host and up to 3 other players connect peer-to-peer via **WebRTC DataChannels** using room codes (no dedicated game servers required).
  3. **Optional Headless Host (`WebSocketAdapter`)**: Because the simulation has zero browser/DOM imports, it remains ready to wrap in a headless Node.js server in the future if ever needed.

---

## 2. Local AI + Player-Hosted P2P Architecture

The codebase must strictly separate **Game Simulation** from **Rendering & Transport** so the game can run purely locally against AI bots or online via P2P with up to 4 humans without duplicating logic:

```text
src/
├── shared/              # Deterministic / authoritative simulation core (Zero Three.js or DOM imports!)
│   ├── config/          # Data-driven balance tables (ships, structures, planets, match presets)
│   ├── sim/             # Fixed-tick game state, combat RPS math, harvesting, orbital rings
│   ├── ai/              # AI Bot controllers (economy, expansion, fleet composition, stances)
│   └── protocol/        # Serializable GameCommand & StateSnapshot schemas
├── client/              # Browser application
│   ├── renderer/        # Three.js scene, orbital camera, planets, nebulae, ships, VFX
│   ├── shaders/         # Custom GLSL vertex/fragment shaders (clouds, atmosphere, lava, wormholes)
│   ├── audio/           # Web Audio API sound effects & ambient space audio
│   ├── ui/              # HUD, orbital slot radial/ring builder, dockyard queues, lobby
│   └── net/             # Transport adapters: LocalSimAdapter (100% local vs. AI) & WebRTCPeerAdapter (P2P Host/Client)
└── server/              # (Optional future) Headless Node.js host wrapping src/shared/sim + src/shared/ai
```

### Architectural Invariants
1. **Purely Local AI Matches**: Single-player vs. AI matches must execute 100% locally in the user's browser with zero external server dependency.
2. **Player-Hosted P2P Multiplayer**: In online matches, the hosting player's browser runs the authoritative `src/shared/sim` loop (plus any AI bot slots) and exchanges `GameCommand` and `StateSnapshot` packets with up to 3 connected peers over WebRTC DataChannels.
3. **No Game Logic in the Renderer**: `src/client/renderer/` and `src/client/ui/` render state snapshots/interpolations and emit `GameCommand` objects. They must never directly mutate authoritative health, resources, or ship positions.
4. **Unified Player & AI Command Interface**: Human players (local or remote P2P peers) and AI Bots (`src/shared/ai/`) interact with the simulation exclusively by submitting valid `GameCommand` actions (e.g., `BUILD_ORBITAL_STRUCTURE`, `QUEUE_SHIP`, `SET_RALLY_POINT`, `SET_PATROL_ROUTE`, `BUILD_TOWER`).
5. **Any Slot Can Be Human or AI**: Every 4-player match supports any mix of Human and AI players (e.g., 1 Human + 3 AI locally, or 2 Humans P2P + 2 AI run by the host).
6. **Data-Driven Balancing**: Never hardcode ship HP, shield values, weapon tracking, costs, or build times inside simulation classes. All balance numbers must live in `src/shared/config/` so they can be tweaked and tested via headless AI-vs-AI simulations.

---

## 3. Visual & Space Atmosphere Standards

A core pillar of **StarConquest** is selling a rich, atmospheric 2.5D/3D space theme. When building or modifying rendering code in `src/client/renderer/` and `src/client/shaders/`, follow these visual standards:

1. **Deep Space & Procedural Nebulae**:
   * Every star system must feature a distinct visual palette (e.g., cyan/magenta emission nebula, golden dust expanse, deep crimson rift).
   * Render backgrounds using multi-layered **procedural FBM (Fractional Brownian Motion) noise shaders**, volumetric-style nebula billboards, and multi-depth parallax starfields—never a flat black or low-res static image.
2. **Multi-Layered Living Planets**:
   * **Terran / Earth & Super-Earth Planets**:
     * **Surface Layer**: PBR/custom shader with distinct continents, Relief/Normal mapping, and specular ocean reflections that catch the system's star light.
     * **Drifting Cloud Layer**: A secondary, slightly larger transparent sphere rotating at a differential speed with procedural or textured cloud coverage and subtle shadow projection onto the planet surface below.
     * **Atmospheric Halo**: An outer Fresnel rim-lighting shader shell that gives the horizon a soft, realistic atmospheric scatter (e.g., azure blue for Earth/Super-Earth worlds).
   * **Rock / Volcanic / Lava Planets**:
     * **Surface Layer**: Rugged, cratered dark basalt rock with normal/roughness maps.
     * **Animated Magma Veins**: Emissive procedural lava cracks and caldera pools that slowly pulse and flow using UV/noise distortion, triggering HDR bloom.
     * **Scorched Atmosphere**: Warm orange/ember Fresnel rim haze.
3. **Orbital Rings, Wormholes & Combat VFX**:
   * **Orbital Rings**: Planets display a sleek orbital ring track with visible slot nodes (`6`, `8`, `10`, or `12` slots depending on planet class) where constructed stations physically orbit or lock into place.
   * **Wormholes**: Render as swirling gravitational lensing / accretion vortex shaders with particle inflow, visually signaling an active spatial choke point.
   * **Selective HDR Bloom**: Use post-processing bloom selectively for ship engine trails, weapon fire (PD tracers vs. heavy Hull Breaker plasma/rail salvos), shield impact ripples, and planetary lava glow.
   * **Performance**: Use `THREE.InstancedMesh` for asteroid belts, Fighter squadrons, and projectiles to maintain 60 FPS in browser.

---

## 4. Non-Negotiable Gameplay Rules

Do not alter these core mechanics without explicit user direction:

1. **Macro-Focused Tug-of-War Control**:
   * Players do **not** micro-manage individual ships in combat.
   * Players control the war via **Dockyard production queues (with auto-repeat)**, **Rally Points**, **Patrol Routes**, and **Fleet Stances**. Fleets engage and prioritize targets automatically using combat AI.
2. **5-System Hub-and-Spoke Galaxy**:
   * **4 Starter Systems** (each with 1 guaranteed **Large** 10-slot Homeworld + randomized **Small** 6-slot / **Medium** 8-slot planets, and an asymmetric Ore/Crystal skew).
   * **1 Central Neutral System** (anchored by 1 **Super-Earth** 12-slot planet + rich asteroid belts + 4 permanent open wormholes connecting to all 4 starter systems, even empty ones).
3. **Planetary Orbital Slots & Building Costs**:
   * **Planet Capacities**: Small = `6`, Medium = `8`, Large = `10`, Super-Earth = `12`.
   * **2-Slot Structures**: Command & Control (Unique Homeworld HQ; losing it = defeat), Orbital Dockyard (Shipyard), Heavy Orbital Defense Platform / Planetary Shield.
   * **1-Slot Structures**: Planetary Outpost (required to claim secondary planets), Refinery (spawns 1 free Harvester + queues more), Tech/Specialization Modules.
4. **Logistics Hubs & Deep-Space Towers**:
   * Deep-space Defence Towers (**Point Defence Towers** with fast tracking vs. **Hull Breaker Towers** with high alpha/low tracking) can **only** be built within the radius of a **Logistics Hub**.
   * **Fighters** require either a **Logistics Hub** or a **Carrier** to operate.
5. **Shields vs. Hull & 5-Class RPS Matrix**:
   * **Shields** exist **only** on **Cruisers, Carriers, Dreadnoughts, and Structures**. **Fighters and Destroyers are Hull-only**.
   * **Fighters**: Ultra-fast, Hull-only, **Shield Breakers**. Swarm and defeat **Dreadnoughts**; shredded by **Cruiser/Destroyer** Point Defence; Fighter-vs-Fighter dogfights include controlled RNG ("pilot skill/luck").
   * **Destroyers**: Fast, Hull-only flankers with medium guns + light PD. Hunt **Carriers**, raid Harvesters, and flank isolated **Cruisers**; crushed by **Dreadnoughts** and massed **Cruisers**.
   * **Cruisers**: Shielded + Armored fleet backbone with strong Point Defence. Shred **Fighters** and out-brawl **Destroyers**; lose to **Dreadnoughts**.
   * **Carriers**: Shielded + Armored mobile airbase. Launch/replenish **Fighters** anywhere to counter **Dreadnoughts**; vulnerable to **Destroyer** rushes and **Cruiser** PD screens.
   * **Dreadnoughts**: Heavy Shields + Massive Hull, very slow siege capitals. Crush **Cruisers**, **Destroyers**, **Logistics Hubs/Towers**, and **Planetary Bases (C&C)**; countered by **Fighters/Carriers** and **Hull Breaker Towers** (once shields are stripped).
6. **Three Pre-Match Lobby Modes**:
   * **Blitz Skirmish** (15–30m, fast economy, open vision in occupied systems, Last C&C Standing).
   * **Standard Tactical** (20–40m, standard economy, sensor-range Fog of War, Last C&C Standing).
   * **Grand Conquest** (45m+, full economy, sensor-range Fog of War, Last C&C Standing OR Central Super-Earth King of the Hill timer).

---

## 5. Git Branching, Verification & Pull Request Workflow

Every agent must strictly follow this source-control workflow when making code changes:

1. **Dedicated Branch per Feature, Bug, or Task**:
   * Never commit new feature, bugfix, or task work directly to `main` / `master`.
   * Before starting work on any new item, create and switch to a dedicated, single-purpose branch so commits stay focused and contextual.
   * **Branch Naming Convention**: Use a clear category prefix followed by a descriptive kebab-case name:
     * `feature/<name>` — New gameplay systems, shaders, UI views, or AI capabilities (e.g., `feature/earth-cloud-shaders`, `feature/orbital-ring-builder`).
     * `fix/<name>` — Bug fixes and regressions (e.g., `fix/fighter-shield-damage`, `fix/wormhole-transit`).
     * `task/<name>` — Project scaffolding, refactoring, tooling, or balance tuning (e.g., `task/scaffold-vite-three`, `task/tune-cruiser-pd`).
2. **Pre-Commit Build & Test Gate**:
   * **Code must build and pass all unit tests before every commit.**
   * Prior to running `git commit` on the working branch, the agent **must** run the project build (`npm run build` / typecheck) and unit test suite (`npm test` / `vitest run`) and verify zero errors.
3. **Human-Only Pull Request Approval**:
   * All completed branch work must be submitted via Pull Request (or presented ready for PR review).
   * **Every PR must be approved by a human (the user).** The agent must **never** merge a PR or merge a working branch into `main` without explicit human instruction and approval.
4. **Autonomous `git` & `npm` Execution**:
   * Do not ask the user for chat confirmation before running routine `git` actions (branch creation, status, diff, staging, committing on the working branch) or `npm` actions (`npm install`, `npm run build`, `npm test`, `npm run dev`).
   * Always invoke `git` and `npm` as single, direct, prefix-matchable commands (avoiding `&&`, `;`, or subshells) so that Antigravity's **Always Allow** prefix approval applies automatically without re-prompting.
