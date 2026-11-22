# StarConquest — Sound & Music Design Guide

This document is the canonical source of truth for all music tracks, dynamic audio switching, and sound effects (SFX) in **StarConquest**. All audio lives strictly on the client (`src/client/audio/` and `public/audio/`) with zero imports in `src/shared/`.

---

## 1. Audio Architecture & Playback Rules

* **Static Audio Assets**: Store music and SFX files under `public/audio/` and resolve URLs using `${import.meta.env.BASE_URL}audio/<filename>` so paths work identically on Vite dev (`/`), production builds (`/StarConquest/`), and P2P sessions.
* **Browser Autoplay Handling**: Browsers may block unmuted audio before the first user interaction. `AmbientMusicPlayer` attempts playback on launch and automatically arms a one-shot `pointerdown` / `keydown` listener if blocked, starting the soundtrack seamlessly on the player's first click or keypress (unless the player muted it first).
* **HUD Mute / Unmute Behavior**:
  * A dedicated speaker icon toggle button sits in the top-right tactical HUD bar next to the simulation speed controls.
  * **Muted**: Immediately stops music playback (`pause()`) and resets the playhead to `0`.
  * **Unmuted**: Restarts cleanly from the beginning (`currentTime = 0`) of the track that was playing when muted — unless the music category changed (e.g. entered `combat` state while muted), in which case it starts playing the active category's playlist.
* **Playlist Shuffling & Looping**:
  * On load, `AmbientMusicPlayer` shuffles all tracks in the active category (`ambient`) via Fisher-Yates and advances through the shuffled list via the `ended` event, looping back to track 1 once every track has played once.
* **No Simulation Coupling**: Audio players only observe client state snapshots and UI events; they never mutate authoritative game state.

---

## 2. Music Track Registry

Every music track is registered in `MUSIC_TRACKS` inside [ambientMusicPlayer.ts](../src/client/audio/ambientMusicPlayer.ts) with an explicit category flag (`ambient` or `combat`).

| Track ID | Title | File (`public/audio/`) | Category Flag | Default Volume | Behavior | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ambient_view_from_perigee` | *The View from Perigee* | `The_View_from_Perigee.mp3` | `ambient` | `0.45` | Shuffled ambient playlist track for exploration, building, and macro planning | **Implemented** |
| `ambient_weight_of_the_far_horizon` | *Weight of the Far Horizon* | `Weight_of_the_Far_Horizon.mp3` | `ambient` | `0.45` | Shuffled ambient playlist track for exploration and macro economy phases | **Implemented** |
| `ambient_passing_the_last_horizon` | *Passing The Last Horizon* | `Passing_The_Last_Horizon.mp3` | `ambient` | `0.45` | Shuffled ambient playlist track for exploration and macro economy phases | **Implemented** |
| `ambient_armada_at_the_edge` | *Armada at the Edge* | `Armada_at_the_Edge.mp3` | `ambient` | `0.45` | Shuffled ambient playlist track for exploration and fleet buildup phases | **Implemented** |
| `combat_iron_horizon` | *Iron Horizon* | `Iron_Horizon.mp3` | `combat` | `0.55` | Intense combat track triggered during active fleet engagements to signal danger and urgency | **Implemented** |


---

## 3. Dynamic Ambient ↔ Combat Music Switching

Dynamic switching between `ambient`-flagged and `combat`-flagged tracks is active (`AmbientMusicPlayer.setCategory` + `AmbientMusicPlayer.update(deltaSeconds)`):

1. **Combat Entry Trigger**:
   * Enter **Combat Music Mode** when any friendly ship or structure takes weapon fire or engages an enemy target.
   * Crossfade smoothly over `1.8s` (fading out ambient while fading in *Iron Horizon*) so entering combat feels dramatic rather than jarring.
2. **Combat Exit Hysteresis (Anti-Flicker Cooldown)**:
   * Remain in **Combat Music Mode** until `14 seconds` have elapsed with zero active combat events involving the local player, preventing rapid switching during skirmishes.
   * Fade out combat music smoothly over `3.0s` back into the `ambient` rotation so combat end is never abrupt.
3. **Mute Override**:
   * Muting always stops all active and fading channels immediately (both `ambient` and `combat`), resetting playhead to `0`; unmuting restarts whichever category matches the current tactical state from the beginning.

---

## 4. Planned Sound Effects (SFX) Catalog

Future SFX should be synthesized via Web Audio API or loaded as lightweight `.ogg`/`.mp3` clips in `public/audio/sfx/`, respecting separate **Music** and **SFX** volume/mute controls once SFX are introduced:

* **UI & Macro Orders**: Subtle metallic confirmation clicks for orbital slot selection, structure placement start/complete, Fleet creation, and right-click Fleet Move/Attack orders.
* **Economy & Logistics**: Low hum/crackle for Harvester mining lasers when zoomed close; gentle docking chime on Refinery completion.
* **Combat Weapons**:
  * **Point Defence (Cruisers / Destroyers / PD Towers)**: Crisp rapid-fire autocannon/flak bursts.
  * **Heavy Batteries (Cruisers / Dreadnoughts / Hull Breaker Towers)**: Deep bass railgun/plasma discharges.
  * **Shield Impacts**: Crystalline resonant shimmer when shields absorb hits; low power-down discharge on shield collapse.
  * **Hull Impacts & Explosions**: Muffled deep-space kinetic thuds and cascading reactor detonation rumbles scaled by hull class.
* **Wormholes**: Deep gravitational bass swell when a fleet transits a wormhole or the camera jumps across systems.
