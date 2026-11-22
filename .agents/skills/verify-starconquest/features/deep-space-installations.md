# Deep-Space Installations

Deep-Space Installations let a player place free-floating Atlas Logistics Hubs anywhere in clear space (with a live green/red wireframe preview ghost) and deploy Point Defence or Hull Breaker Defence Towers inside a completed Logistics Hub's `180u` tether radius.

## Sub-features

- `ds-tower-gated` keeps Point Defence Tower and Hull Breaker Tower buttons disabled until a friendly Logistics Hub is completed in the active system.
- `ds-hub-place` enters placement mode, shows a live green/red ghost with the `180u` build radius ring, and constructs an Atlas Logistics Hub on valid click.
- `ds-spacing-enforced` rejects invalid placements overlapping planets, wormholes, or within `120u` of another Logistics Hub.
- `ds-tower-place` enables tower buttons once the Hub completes and places a Point Defence Tower inside its `180u` radius.

## How to get to it (user POV)

- Click `+ Place Logistics Hub (...)`, `+ Place Point Defence Tower (...)`, or `+ Place Hull Breaker Tower (...)` in the **Deep-Space Installations** section of `#hud-overlay`.
- Move the cursor over `#app-canvas` to inspect the green (valid) or red (invalid) wireframe ghost, then left-click to place or press `Escape` / click `Cancel Placement (Esc)` to cancel.

## Driving it with browser

Preconditions:

- StarConquest is healthy at `http://127.0.0.1:5179/` (Doctor passed).
- Player has at least `320` Ore and `120` Crystal (starting resources satisfy Logistics Hub placement immediately).

- **Confirm tower gating.** Verify `[data-place-deepspace="point_defence_tower"]` and `[data-place-deepspace="hull_breaker_tower"]` both have the `disabled` attribute on initial load.
- **Enter Hub placement & cancel with Escape.** Click `[data-place-deepspace="logistics_hub"]`. Button becomes `active` and `[data-action="cancel-deepspace"]` appears. Press `Escape`. Placement cancels and `.hud-status-msg` reads `Cancelled deep-space placement mode.`.
- **Place Atlas Logistics Hub.** Click `[data-action="overview"]` for wide clear space, click `[data-place-deepspace="logistics_hub"]`, and left-click clear space on `#app-canvas` well away from the Homeworld orbital ring. `.hud-status-msg` confirms placement, `[data-focus-deepspace]` appears with a progress percentage badge, and `#econ-ore-val` drops by `320`.
- **Complete Hub & unlock Defence Towers.** Click `[data-speed="4"]` and wait `~5.5s` (`20s` build time at `4x`). The `[data-deepspace-badge]` updates to `Operational`, `#econ-supply-val` cap increases by `+15`, and `[data-place-deepspace="point_defence_tower"]` is no longer `disabled`.
- **Focus Hub & place Point Defence Tower.** Click `[data-focus-deepspace]` to center the camera on the Hub's cyan `180u` tether ring. Click `[data-place-deepspace="point_defence_tower"]` and left-click inside the tether ring (at least `42u` from the Hub center). A second `[data-focus-deepspace]` button (`Point Defence Tower #2`) appears.
- **Proof.** Capture a screenshot showing the operational Atlas Logistics Hub with its `180u` radius ring and the Point Defence Tower under construction/operational inside it, plus before/after supply cap and `0` console errors.

## Gotchas

- Placing a Logistics Hub right on top of the Homeworld (`< orbitalRingRadius + 24u`) or within `45u` of a wormhole mouth turns the ghost red and rejects the click with a reason in `.hud-status-msg`.
- Two Logistics Hubs must be at least `120u` apart; a Defence Tower must be at least `42u` from a Hub and `30u` from another Tower.
- Always zoom out via `[data-action="overview"]` before placing the first Logistics Hub so open deep space is clearly visible to the right of `#hud-overlay`.
