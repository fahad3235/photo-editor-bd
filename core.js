// photo-editor-bd — core.js
// Pure, testable logic for the offline photo editor.
// No DOM access here; app.js owns the DOM. All functions are deterministic
// and safe to unit-test in Node.

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const DEFAULT_SETTINGS = Object.freeze({
  brightness: 100, // %
  contrast: 100,   // %
  saturate: 100,   // %
  sepia: 0,        // %
  grayscale: 0,    // %
  blur: 0,         // px
  hue: 0,          // deg
});

export const SETTING_LIMITS = Object.freeze({
  brightness: { min: 0, max: 200, step: 1, unit: '%' },
  contrast: { min: 0, max: 200, step: 1, unit: '%' },
  saturate: { min: 0, max: 200, step: 1, unit: '%' },
  sepia: { min: 0, max: 100, step: 1, unit: '%' },
  grayscale: { min: 0, max: 100, step: 1, unit: '%' },
  blur: { min: 0, max: 10, step: 0.5, unit: 'px' },
  hue: { min: -180, max: 180, step: 1, unit: '°' },
});

// Named looks. Values are full settings objects so a preset is one apply.
export const PRESETS = Object.freeze({
  normal: { ...DEFAULT_SETTINGS },
  vivid: { ...DEFAULT_SETTINGS, saturate: 150, contrast: 115, brightness: 105 },
  warm: { ...DEFAULT_SETTINGS, sepia: 30, saturate: 115, hue: -8 },
  cool: { ...DEFAULT_SETTINGS, saturate: 110, hue: 18, brightness: 103 },
  bw: { ...DEFAULT_SETTINGS, grayscale: 100, contrast: 110 },
  vintage: { ...DEFAULT_SETTINGS, sepia: 55, contrast: 90, brightness: 105, saturate: 80 },
  noir: { ...DEFAULT_SETTINGS, grayscale: 100, contrast: 150, brightness: 95 },
});

export const PRESET_ORDER = ['normal', 'vivid', 'warm', 'cool', 'bw', 'vintage', 'noir'];

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function clampSettings(partial) {
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (partial && key in partial) {
      const lim = SETTING_LIMITS[key];
      out[key] = clamp(partial[key], lim.min, lim.max);
    }
  }
  return out;
}

// Build the CSS filter string applied to the canvas context.
// Order matters for reproducibility; default values are still emitted so
// the string is a complete, comparable snapshot of the settings.
export function buildFilterString(s) {
  const v = clampSettings(s);
  return [
    `brightness(${v.brightness}%)`,
    `contrast(${v.contrast}%)`,
    `saturate(${v.saturate}%)`,
    `sepia(${v.sepia}%)`,
    `grayscale(${v.grayscale}%)`,
    `blur(${v.blur}px)`,
    `hue-rotate(${v.hue}deg)`,
  ].join(' ');
}

export function isDefaultSettings(s) {
  return buildFilterString(s) === buildFilterString(DEFAULT_SETTINGS);
}

export function applyPreset(name) {
  if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) return null;
  return { ...PRESETS[name] };
}

export function presetNameIsValid(name) {
  return Object.prototype.hasOwnProperty.call(PRESETS, name);
}

// --- Transform state -------------------------------------------------------
// rotation: 0 | 90 | 180 | 270 (clockwise degrees)
// flipH / flipV: booleans
export function rotateState(state, direction) {
  // direction: +1 = clockwise 90, -1 = counter-clockwise 90
  const next = (state.rotation + (direction > 0 ? 90 : 270)) % 360;
  return { ...state, rotation: next };
}

export function flipState(state, axis) {
  if (axis === 'h') return { ...state, flipH: !state.flipH };
  if (axis === 'v') return { ...state, flipV: !state.flipV };
  return { ...state };
}

export function isRotatedSideways(rotation) {
  return rotation === 90 || rotation === 270;
}

// Dimensions of the canvas after rotation (flips do not change size).
export function rotatedDimensions(width, height, rotation) {
  if (isRotatedSideways(rotation)) return { width: height, height: width };
  return { width, height };
}

// Scale an image down so its longest side is at most maxSide, keeping ratio.
// Never upscales.
export function fitDimensions(width, height, maxSide = 1600) {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// --- File validation --------------------------------------------------------
export function validateImageFile(file) {
  if (!file || typeof file !== 'object') return { ok: false, error: 'no-file' };
  if (!ACCEPTED_TYPES.includes(file.type)) return { ok: false, error: 'bad-type' };
  if (typeof file.size !== 'number' || file.size <= 0) return { ok: false, error: 'bad-size' };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'too-large' };
  return { ok: true, error: null };
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// --- Export -----------------------------------------------------------------
export function exportFileName(baseName, format) {
  const clean = String(baseName || 'photo')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'photo';
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  return `${clean}-edited.${ext}`;
}

export function exportMime(format) {
  return format === 'jpeg' ? 'image/jpeg' : 'image/png';
}

export function clampQuality(q) {
  return clamp(q, 10, 100) / 100;
}

// Convert ASCII digits to Bengali digits for display.
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
export function toBengaliDigits(input) {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}
