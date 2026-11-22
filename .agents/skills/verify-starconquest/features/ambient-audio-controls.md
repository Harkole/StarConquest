# Ambient Audio Controls

Ambient Audio Controls manages the shuffled 4-track ambient soundtrack, unlocks browser autoplay on the first user gesture or speaker click, and lets the player stop/mute and restart playback from the beginning of the active track via the top HUD speaker icon.

## Sub-features

- `audio-asset-load` loads one of the 4 shuffled `ambient` MP3 tracks from `/audio/*.mp3` (or `/StarConquest/audio/*.mp3` in production preview) with `200`/`206` status and zero `404`s.
- `audio-gesture-unlock` unlocks blocked browser autoplay on the first click/keypress anywhere or on a single click of the speaker icon.
- `audio-mute-unmute` toggles the speaker SVG icon and ARIA label between muted (`"Unmute ambient music (restarts from beginning)"`) and unmuted (`"Mute ambient music"`).

## How to get to it (user POV)

- Look at the top-right economy bar (`.econ-actions`) next to the `1x` / `2x` / `4x` speed buttons for the speaker icon button (`[data-action="toggle-music"]`).
- Click anywhere in the game to satisfy browser autoplay policy, then click the speaker button to mute (stops playback and resets to `0`) and click again to unmute (restarts the active track from `0`).

## Driving it with browser

Preconditions:

- StarConquest is healthy at `http://127.0.0.1:5179/` (Doctor passed).

- **Verify network asset load.** Inspect network requests for `/audio/`. Confirm an `.mp3` request (`The_View_from_Perigee.mp3`, `Weight_of_the_Far_Horizon.mp3`, `Passing_The_Last_Horizon.mp3`, or `Armada_at_the_Edge.mp3`) returned HTTP `200` or `206 Partial Content` with `0` `404` responses.
- **Satisfy browser autoplay gesture.** Click `[data-speed="1"]` (a benign non-mute user gesture). Confirm `[data-action="toggle-music"]` has class `active` and `aria-label="Mute ambient music"`.
- **Mute soundtrack.** Click `[data-action="toggle-music"]`. Button loses class `active`, `aria-label` changes to `"Unmute ambient music (restarts from beginning)"`, and the SVG renders the crossed-out muted speaker (`<line x1="23" ...>`).
- **Unmute soundtrack.** Click `[data-action="toggle-music"]` again. Button regains class `active`, `aria-label` returns to `"Mute ambient music"`, and the SVG renders the sound-wave paths (`<path d="M15.54 ...">`).
- **Proof.** Capture before/after `aria-label` and `classList` of `[data-action="toggle-music"]`, network status of the loaded `.mp3`, a screenshot of the top HUD bar, and `0` console errors.

## Gotchas

- `206 Partial Content` on `.mp3` requests is normal HTTP byte-range streaming in Chromium/Vite, not an error.
- On a fresh load before any user click/key, browsers block unmuted autoplay. Clicking `[data-action="toggle-music"]` as the very first action starts playback immediately while keeping the button unmuted (by design, so you never need a double toggle).
- When verifying GitHub Pages production builds (`vite preview`), the URL must include `/StarConquest/` and the MP3 request must resolve to `/StarConquest/audio/<track>.mp3`.
