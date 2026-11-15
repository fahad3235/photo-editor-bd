// photo-editor-bd — core unit tests. Run: node --test tests/core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  PRESETS,
  PRESET_ORDER,
  clamp,
  clampSettings,
  buildFilterString,
  isDefaultSettings,
  applyPreset,
  presetNameIsValid,
  rotateState,
  flipState,
  isRotatedSideways,
  rotatedDimensions,
  fitDimensions,
  validateImageFile,
  formatBytes,
  exportFileName,
  exportMime,
  clampQuality,
  toBengaliDigits,
  MAX_FILE_BYTES,
} from '../core.js';

test('clamp bounds values and falls back on non-numbers', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(99, 0, 10), 10);
  assert.equal(clamp(NaN, 2, 9), 2);
  assert.equal(clamp('x', 2, 9), 2);
});

test('default filter string is the neutral filter', () => {
  assert.equal(
    buildFilterString(DEFAULT_SETTINGS),
    'brightness(100%) contrast(100%) saturate(100%) sepia(0%) grayscale(0%) blur(0px) hue-rotate(0deg)',
  );
  assert.equal(isDefaultSettings(DEFAULT_SETTINGS), true);
});

test('filter string reflects settings and clamps out-of-range values', () => {
  const s = buildFilterString({ brightness: 150, contrast: 80, saturate: 120, sepia: 25, grayscale: 0, blur: 2, hue: -30 });
  assert.equal(s, 'brightness(150%) contrast(80%) saturate(120%) sepia(25%) grayscale(0%) blur(2px) hue-rotate(-30deg)');
  assert.equal(buildFilterString({ brightness: 9999 }), buildFilterString({ ...DEFAULT_SETTINGS, brightness: 200 }));
  assert.equal(buildFilterString({ blur: -5 }), buildFilterString({ ...DEFAULT_SETTINGS, blur: 0 }));
});

test('clampSettings fills missing keys with defaults', () => {
  assert.deepEqual(clampSettings({ brightness: 120 }), { ...DEFAULT_SETTINGS, brightness: 120 });
  assert.deepEqual(clampSettings(null), { ...DEFAULT_SETTINGS });
  assert.deepEqual(clampSettings({ hue: 500 }), { ...DEFAULT_SETTINGS, hue: 180 });
});

test('every preset is valid, applies, and is non-default except normal', () => {
  assert.equal(PRESET_ORDER.length, 7);
  for (const name of PRESET_ORDER) {
    assert.equal(presetNameIsValid(name), true);
    const applied = applyPreset(name);
    assert.ok(applied, name);
    assert.equal(buildFilterString(applied).length > 0, true);
  }
  assert.equal(presetNameIsValid('nope'), false);
  assert.equal(applyPreset('nope'), null);
  assert.equal(isDefaultSettings(PRESETS.normal), true);
  assert.equal(isDefaultSettings(PRESETS.vivid), false);
  assert.equal(isDefaultSettings(PRESETS.bw), false);
  // vivid really is more saturated; bw really is fully grey
  assert.equal(PRESETS.vivid.saturate, 150);
  assert.equal(PRESETS.bw.grayscale, 100);
  assert.equal(PRESETS.noir.contrast, 150);
});

test('rotation cycles 0 -> 90 -> 180 -> 270 -> 0 both ways', () => {
  let st = { rotation: 0, flipH: false, flipV: false };
  st = rotateState(st, +1);
  assert.equal(st.rotation, 90);
  st = rotateState(st, +1);
  assert.equal(st.rotation, 180);
  st = rotateState(st, +1);
  assert.equal(st.rotation, 270);
  st = rotateState(st, +1);
  assert.equal(st.rotation, 0);
  st = rotateState(st, -1);
  assert.equal(st.rotation, 270);
  st = rotateState(st, -1);
  assert.equal(st.rotation, 180);
});

test('flips toggle independently; unknown axis is a no-op', () => {
  let st = { rotation: 0, flipH: false, flipV: false };
  st = flipState(st, 'h');
  assert.equal(st.flipH, true);
  assert.equal(st.flipV, false);
  st = flipState(st, 'h');
  assert.equal(st.flipH, false);
  st = flipState(st, 'v');
  assert.equal(st.flipV, true);
  assert.deepEqual(flipState(st, 'x'), st);
});

test('rotated dimensions swap only at 90/270', () => {
  assert.deepEqual(rotatedDimensions(800, 600, 0), { width: 800, height: 600 });
  assert.deepEqual(rotatedDimensions(800, 600, 90), { width: 600, height: 800 });
  assert.deepEqual(rotatedDimensions(800, 600, 180), { width: 800, height: 600 });
  assert.deepEqual(rotatedDimensions(800, 600, 270), { width: 600, height: 800 });
  assert.equal(isRotatedSideways(90), true);
  assert.equal(isRotatedSideways(180), false);
});

test('fitDimensions never upscales and caps the long side at 1600', () => {
  assert.deepEqual(fitDimensions(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitDimensions(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(fitDimensions(1000, 4000), { width: 400, height: 1600 });
  assert.deepEqual(fitDimensions(1600, 900), { width: 1600, height: 900 });
  assert.deepEqual(fitDimensions(0, 0), { width: 0, height: 0 });
});

test('validateImageFile accepts real photos and rejects the rest', () => {
  assert.deepEqual(validateImageFile({ type: 'image/jpeg', size: 1024 }), { ok: true, error: null });
  assert.deepEqual(validateImageFile({ type: 'image/png', size: 1024 }), { ok: true, error: null });
  assert.deepEqual(validateImageFile({ type: 'image/webp', size: 1024 }), { ok: true, error: null });
  assert.deepEqual(validateImageFile({ type: 'image/gif', size: 1024 }), { ok: true, error: null });
  assert.deepEqual(validateImageFile({ type: 'image/svg+xml', size: 1024 }), { ok: false, error: 'bad-type' });
  assert.deepEqual(validateImageFile({ type: 'application/pdf', size: 1024 }), { ok: false, error: 'bad-type' });
  assert.deepEqual(validateImageFile({ type: 'image/png', size: 0 }), { ok: false, error: 'bad-size' });
  assert.deepEqual(validateImageFile({ type: 'image/png', size: MAX_FILE_BYTES + 1 }), { ok: false, error: 'too-large' });
  assert.deepEqual(validateImageFile(null), { ok: false, error: 'no-file' });
});

test('formatBytes renders B/KB/MB sensibly', () => {
  assert.equal(formatBytes(500), '500 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.00 MB');
});

test('export file names are safe and format-correct', () => {
  assert.equal(exportFileName('my-photo', 'png'), 'my-photo-edited.png');
  assert.equal(exportFileName('my-photo', 'jpeg'), 'my-photo-edited.jpg');
  assert.equal(exportFileName('my photo 2026', 'png'), 'my-photo-2026-edited.png');
  assert.equal(exportFileName('a/b:c*d?e', 'png'), 'abcde-edited.png');
  assert.equal(exportFileName('', 'png'), 'photo-edited.png');
  assert.equal(exportFileName('   ', 'jpeg'), 'photo-edited.jpg');
  assert.equal(exportMime('jpeg'), 'image/jpeg');
  assert.equal(exportMime('png'), 'image/png');
  assert.equal(exportMime('other'), 'image/png');
});

test('JPEG quality clamps to 0.1–1.0', () => {
  assert.equal(clampQuality(90), 0.9);
  assert.equal(clampQuality(5), 0.1);
  assert.equal(clampQuality(500), 1);
});

test('Bengali digit conversion covers 0–9', () => {
  assert.equal(toBengaliDigits('0123456789'), '০১২৩৪৫৬৭৮৯');
  assert.equal(toBengaliDigits('100%'), '১০০%');
  assert.equal(toBengaliDigits('no digits'), 'no digits');
});
