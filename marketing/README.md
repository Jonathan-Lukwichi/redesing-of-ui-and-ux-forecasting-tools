# Marketing assets

## Producing the promo mp4 (no screen recording needed)

```powershell
node marketing/record-video.cjs <outputDir>
```

records the laptop hero scene and the closing card (ed-endcard.html) to webm
with the Replay/Loop buttons hidden, and writes timing.json with each take's
wall-clock length. ffmpeg then retimes, trims and concatenates them; see the
git history of this folder for the exact ffmpeg invocation last used. Final
output: healthforecast-promo.mp4 (1080p, 30fps, about 23 seconds).

Standalone files for promo material. Nothing in this folder is part of the app:
it is not bundled by Vite, not copied into the Docker image, not served by the
API, and not touched by the Playwright suite.

## ed-forecast-hero.html

Laptop-on-desk product hero shot (Apple / Linear style): the dashboard animates
on a CSS-built laptop at a subtle 3D angle, a tagline fades in on the left, and
the room around it is styled after the Pexels "data space" reference video
(teal dot field, floating glass columns, dashed ticks, wireframes). The cycle
runs about 13 seconds, holds 3, then loops. Same recording tips as below.

## ed-forecast-scene.html

A self-contained cinematic demo scene (monitor in a dark control room, dashboard
animating inside the screen) meant to be screen-recorded as a marketing video.

- Open the file directly in Chrome (double-click, or `start marketing\ed-forecast-scene.html`).
- Press F11 for fullscreen before recording; record at 1920x1080 or higher.
- The sequence runs about 12 seconds, holds 3 seconds, then loops forever.
- Tiny Replay / Loop buttons sit in the bottom-right corner; they are dim on
  purpose and easy to crop out of a recording.
- Needs internet on first load for Google Fonts (Space Grotesk + Inter); if
  offline it falls back to system fonts.
- All numbers are illustrative demo data. The weekly total (446) equals the sum
  of the seven day tiles.
