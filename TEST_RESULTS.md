# TEST RESULTS — photo-editor-bd (run #346, 2026-11-15 16:00 slot)

> Numbering note: this run was built as #345, but the concurrent 15:00 run
> (coxs-bazar-bd) recorded #345 in the ledger first, so this run takes #346
> per the factory re-read rule. The initial commit message still says
> "(run #345)" — that text is frozen in git history and is corrected here.

## Unit tests (Node built-in runner)
Command: `node --test tests/core.test.mjs`
Result: **14/14 pass, 0 fail** (final run after all fixes).

Covered: clamp bounds + non-number fallback; neutral default filter string;
filter string values + clamping; clampSettings defaults; all 7 presets valid,
non-default except Normal, exact Vivid/B&W/Noir values; rotation cycle
0→90→180→270→0 both directions; flip toggles + unknown-axis no-op; rotated
dimensions swap only at 90/270; fitDimensions cap at 1600px, no upscale;
file validation (accept jpeg/png/webp/gif; reject svg/pdf, empty, >20 MB);
formatBytes; export file-name sanitising + extensions; JPEG quality clamp;
Bengali digit conversion 0–9.

## Headless-Chrome smoke tests (raw CDP, no deps)
Command: `node tests/smoke.mjs http://127.0.0.1:8321/index.html .`
Chrome: headless_shell 140.0.7339.16 (Playwright cache), served over local HTTP
(ES modules are CORS-blocked on file://).
Result: **27/27 checks pass, 0 console/page errors** (final run after all fixes).

Desktop (1280px): upload visible, editor hidden on load; title correct;
7 sliders + 7 presets built; sample photo opens editor; canvas 800×600 with
474 non-blank pixel samples; photo info shows sample name; Vivid sets
saturation 150% and activates; badge reads Edited; rotate swaps canvas to
600×800; reset restores 800×600, 100%, badge Original; BN toggle switches
title to ফটো এডিটর বিডি, translates download button, renders ১০০%; EN toggle
restores; JPEG reveals quality slider; download enabled; file input accepts
image types only.
Mobile (390px): no horizontal overflow (scrollWidth 390 = clientWidth);
editor opens; canvas fits viewport (306px).

## Screenshot review (hand-verified)
Desktop 1280×900 and mobile 390×844 captures taken after applying the Vivid
preset to the sample photo: dark UI clean, sliders/presets legible, sample
scene (house, tree, boat) renders correctly, mobile stacks with no overflow.
Files: /tmp/photo-editor-desktop.png, /tmp/photo-editor-mobile.png.

## Repairs (2 cycles, both in the smoke category)
1. Syntax error in app.js line 166 — truncated nested ternary
   (`? '°'` with no `: ` branch) — found by the first smoke run (module failed
   to load, preset buttons missing), fixed, full suite re-run green.
2. Missing `saturate` i18n key — slider key is `saturate`, i18n only had
   `saturation`, so the label fell back to the raw key — found by screenshot
   review, fixed in both languages, full suite re-run green.

## Environment notes
- /opt/meta-chromium/chrome (Muse Browser 157) refuses headless startup
  ("Hatch WebGL domain policy is required for browser startup") — used the
  Playwright-cached headless_shell-1187 instead, which works.
- /tmp/qaf.mjs from AGENTS.md no longer exists; smoke.mjs is self-contained
  (raw CDP over node's built-in WebSocket).
