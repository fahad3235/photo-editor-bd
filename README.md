# Photo Editor BD 🖼️

A free, offline photo editor that runs entirely in the browser — no upload, no
account, no watermark. Built for Bangladesh: bilingual English/বাংলা interface,
Bengali digits, and a zero-cost workflow for anyone who needs a quick edit
before posting a photo.

**Live demo:** https://fahad3235.github.io/photo-editor-bd/
**Status:** Complete MVP — all tests passing (see [Testing](#testing)).

## The problem

Quick photo edits in Bangladesh usually mean installing a heavy app, creating
an account, or uploading personal photos to a stranger's server — often over a
slow mobile connection. Existing free web editors are ad-heavy and upload your
photos before you can even crop them.

Photo Editor BD does the whole job on the device: open the page, pick a photo,
adjust it, download it. Nothing ever leaves the phone or computer.

## Features

1. **Upload any photo** — JPG, PNG, WebP or GIF up to 20 MB, via file picker
   or drag-and-drop. Invalid files get a clear error in your language.
2. **7 live adjustments** — brightness, contrast, saturation, sepia,
   black & white, blur, and colour shift, all with instant canvas preview.
3. **7 one-tap looks** — Normal, Vivid, Warm, Cool, B & W, Vintage, Noir.
4. **Rotate & flip** — rotate left/right in 90° steps, flip sideways or
   up-down; canvas dimensions swap correctly on rotation.
5. **Hold to compare** — hold the Original button (or the hint) to see the
   unedited photo, release to return to your edit.
6. **Export your way** — PNG or JPEG (with quality slider), custom file name,
   safe file-name sanitising; downloads straight from the canvas.
7. **Bilingual EN/বাংলা** — full interface translation, persisted language
   choice, Bengali digits on numeric readouts; last-used adjustments are
   remembered on the same device.
8. **Built-in sample photo** — a drawn village scene (house, tree, boat on a
   river) so the editor can be tried with no upload at all.

## Stack

- Plain HTML + CSS + vanilla JavaScript (ES modules, no framework, no build
  step, zero network requests at runtime).
- Canvas 2D API with `ctx.filter` for all adjustments.
- `localStorage` only for language + last-used settings.
- Node.js built-in test runner (`node:test`) for unit tests; raw Chrome
  DevTools Protocol (no dependencies) for headless smoke tests.

## Prerequisites

- Any modern browser (Chrome, Edge, Firefox, Safari) — no install needed.
- Node.js 18+ only if you want to run the tests.

## Install & run

```bash
# Clone and open — there is no build step.
git clone https://github.com/fahad3235/photo-editor-bd.git
cd photo-editor-bd

# Option A: just open index.html in a browser.
# Option B: serve locally (recommended — ES modules need http(s)):
python3 -m http.server 8321
# then visit http://127.0.0.1:8321/
```

## Testing

```bash
# Unit tests for the pure logic in core.js (14 tests)
node --test tests/core.test.mjs

# Headless-Chrome smoke tests (27 checks: desktop 1280px + mobile 390px)
# Needs a headless Chrome/Chromium with --remote-debugging-port=9222
# and the app served over local HTTP (ES modules are CORS-blocked on file://).
python3 -m http.server 8321 &
node tests/smoke.mjs http://127.0.0.1:8321/index.html .
```

Verified 2026-11-15: **14/14 unit tests pass; 27/27 smoke checks pass**
(desktop + 390px mobile, zero console/page/network errors), including a
hand-verified screenshot review of both layouts. One repair cycle during the
build: a truncated ternary in `app.js` (syntax error) found by the smoke run
and fixed; a missing `saturate` i18n key found by screenshot review and fixed.

## Deployment

Static site — any static host works. GitHub Pages: enable Pages on the `main`
branch, root folder; the site is live at
https://fahad3235.github.io/photo-editor-bd/.

## Limitations

- Edits are not saved as projects — closing the page loses the current photo
  (settings are remembered, the photo is not, by design: photos never leave
  the device).
- No crop tool yet — rotation, flip, and adjustments only.
- Very large photos are downscaled to a 1600px longest side for smooth
  editing; the download is the edited downscaled image.
- Canvas filters render identically in all modern browsers, but exact pixel
  output can vary slightly between browser engines.
- JPEG quality below 100% is lossy, as with any JPEG export.

## Privacy

100% private by construction. There is no server, no analytics, no upload —
the app makes zero network requests. Photos are processed in the browser's
canvas and never leave the device.
