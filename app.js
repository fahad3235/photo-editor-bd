// photo-editor-bd — app.js
// DOM wiring for the offline photo editor. Pure logic lives in core.js;
// strings live in i18n.js. No network calls anywhere.

import {
  DEFAULT_SETTINGS,
  SETTING_LIMITS,
  PRESET_ORDER,
  buildFilterString,
  clampSettings,
  isDefaultSettings,
  applyPreset,
  rotateState,
  flipState,
  rotatedDimensions,
  fitDimensions,
  validateImageFile,
  formatBytes,
  exportFileName,
  exportMime,
  clampQuality,
  toBengaliDigits,
} from './core.js';
import { getStrings } from './i18n.js';

const $ = (id) => document.getElementById(id);
const els = {
  uploadSection: $('uploadSection'),
  editorSection: $('editorSection'),
  dropZone: $('dropZone'),
  fileInput: $('fileInput'),
  chooseBtn: $('chooseBtn'),
  sampleBtn: $('sampleBtn'),
  errorBox: $('errorBox'),
  canvas: $('canvas'),
  photoInfo: $('photoInfo'),
  stateBadge: $('stateBadge'),
  compareBtn: $('compareBtn'),
  resetBtn: $('resetBtn'),
  changeBtn: $('changeBtn'),
  presetRow: $('presetRow'),
  sliderList: $('sliderList'),
  rotLeft: $('rotLeft'),
  rotRight: $('rotRight'),
  flipHBtn: $('flipHBtn'),
  flipVBtn: $('flipVBtn'),
  formatSelect: $('formatSelect'),
  qualityField: $('qualityField'),
  qualitySlider: $('qualitySlider'),
  qualityVal: $('qualityVal'),
  fileNameInput: $('fileNameInput'),
  downloadBtn: $('downloadBtn'),
  langToggle: $('langToggle'),
};

const LS_LANG = 'photo-editor-bd.lang';
const LS_SETTINGS = 'photo-editor-bd.settings';
const SAMPLE_NAME = 'sample-photo';

let lang = 'en';
let strings = getStrings('en');
let source = null; // HTMLImageElement | HTMLCanvasElement
let sourceName = '';
let sourceSize = 0;
let settings = { ...DEFAULT_SETTINGS };
let transform = { rotation: 0, flipH: false, flipV: false };
let showingOriginal = false;
let activePreset = 'normal';

function store(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: ignore */ }
}
function readStore(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function fmtNum(n) {
  return lang === 'bn' ? toBengaliDigits(String(n)) : String(n);
}

// --- i18n -------------------------------------------------------------------
function applyStrings() {
  strings = getStrings(lang);
  document.documentElement.lang = lang === 'bn' ? 'bn' : 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (strings[key] !== undefined) el.textContent = strings[key];
  });
  els.langToggle.textContent = strings.langButton;
  buildSliders();
  buildPresets();
  updateBadge();
  updatePhotoInfo();
}

function t(key) {
  return strings[key] !== undefined ? strings[key] : key;
}

// --- Rendering ---------------------------------------------------------------
function render() {
  if (!source) return;
  const ctx = els.canvas.getContext('2d');
  const natural = { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  const fitted = fitDimensions(natural.width, natural.height, 1600);
  const dims = showingOriginal
    ? fitted
    : rotatedDimensions(fitted.width, fitted.height, transform.rotation);
  els.canvas.width = dims.width;
  els.canvas.height = dims.height;
  ctx.save();
  ctx.clearRect(0, 0, dims.width, dims.height);
  if (showingOriginal) {
    ctx.filter = 'none';
    ctx.drawImage(source, 0, 0, fitted.width, fitted.height);
  } else {
    ctx.filter = buildFilterString(settings);
    ctx.translate(dims.width / 2, dims.height / 2);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);
    ctx.drawImage(source, -fitted.width / 2, -fitted.height / 2, fitted.width, fitted.height);
  }
  ctx.restore();
  updateBadge();
}

function updateBadge() {
  const edited = !isDefaultSettings(settings)
    || transform.rotation !== 0 || transform.flipH || transform.flipV;
  els.stateBadge.textContent = edited ? t('edited') : t('original');
  els.stateBadge.classList.toggle('edited', edited);
}

function updatePhotoInfo() {
  if (!source) { els.photoInfo.textContent = ''; return; }
  const natural = { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  const sizeText = sourceSize ? ` · ${formatBytes(sourceSize)}` : '';
  els.photoInfo.textContent = `${sourceName} · ${fmtNum(natural.width)}×${fmtNum(natural.height)}${sizeText}`;
}

// --- Controls -----------------------------------------------------------------
const SLIDER_KEYS = ['brightness', 'contrast', 'saturate', 'sepia', 'grayscale', 'blur', 'hue'];

function buildSliders() {
  els.sliderList.innerHTML = '';
  for (const key of SLIDER_KEYS) {
    const lim = SETTING_LIMITS[key];
    const row = document.createElement('div');
    row.className = 'slider-row';
    const label = document.createElement('label');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = t(key);
    const out = document.createElement('output');
    out.id = `out-${key}`;
    out.textContent = fmtNum(settings[key]) + (lim.unit === '%' ? '%' : lim.unit === 'px' ? 'px' : '°');
    label.append(nameSpan, out);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = lim.min;
    input.max = lim.max;
    input.step = lim.step;
    input.value = settings[key];
    input.setAttribute('aria-label', t(key));
    input.addEventListener('input', () => {
      settings = clampSettings({ ...settings, [key]: Number(input.value) });
      out.textContent = fmtNum(settings[key]) + (lim.unit === '%' ? '%' : lim.unit === 'px' ? 'px' : '°');
      activePreset = 'normal';
      markActivePreset();
      store(LS_SETTINGS, JSON.stringify(settings));
      render();
    });
    row.append(label, input);
    els.sliderList.append(row);
  }
}

function buildPresets() {
  els.presetRow.innerHTML = '';
  for (const name of PRESET_ORDER) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn' + (name === activePreset ? ' active' : '');
    btn.dataset.preset = name;
    btn.textContent = t(`preset_${name}`);
    btn.addEventListener('click', () => {
      const next = applyPreset(name);
      if (!next) return;
      settings = next;
      activePreset = name;
      store(LS_SETTINGS, JSON.stringify(settings));
      buildSliders();
      markActivePreset();
      render();
    });
    els.presetRow.append(btn);
  }
}

function markActivePreset() {
  els.presetRow.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.preset === activePreset);
  });
}

function resetAll() {
  settings = { ...DEFAULT_SETTINGS };
  transform = { rotation: 0, flipH: false, flipV: false };
  activePreset = 'normal';
  store(LS_SETTINGS, JSON.stringify(settings));
  buildSliders();
  markActivePreset();
  render();
}

// --- Loading images ------------------------------------------------------------
function showError(code) {
  const map = {
    'bad-type': 'errorBadType',
    'too-large': 'errorTooLarge',
    'bad-size': 'errorBadSize',
    'load-failed': 'errorLoad',
  };
  els.errorBox.textContent = t(map[code] || 'errorLoad');
  els.errorBox.hidden = false;
}
function clearError() { els.errorBox.hidden = true; els.errorBox.textContent = ''; }

function loadImageObject(img, name, size) {
  source = img;
  sourceName = name;
  sourceSize = size;
  resetAll();
  els.uploadSection.hidden = true;
  els.editorSection.hidden = false;
  updatePhotoInfo();
  render();
}

function handleFile(file) {
  clearError();
  const check = validateImageFile(file);
  if (!check.ok) { showError(check.error); return; }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    loadImageObject(img, file.name.replace(/\.[^.]+$/, ''), file.size);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    showError('load-failed');
  };
  img.src = url;
}

// Deterministic sample scene so the editor works with no upload at all.
function makeSamplePhoto() {
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 600;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 380);
  sky.addColorStop(0, '#7ec8f7');
  sky.addColorStop(1, '#dff3ff');
  x.fillStyle = sky;
  x.fillRect(0, 0, 800, 380);
  x.fillStyle = '#ffd94d';
  x.beginPath(); x.arc(640, 110, 55, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#ffffff';
  x.beginPath(); x.ellipse(200, 100, 90, 26, 0, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.ellipse(330, 150, 70, 20, 0, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#5da24a';
  x.beginPath(); x.moveTo(0, 380); x.quadraticCurveTo(200, 300, 420, 380);
  x.quadraticCurveTo(620, 450, 800, 370); x.lineTo(800, 600); x.lineTo(0, 600); x.closePath(); x.fill();
  x.fillStyle = '#3f8f3a';
  x.beginPath(); x.moveTo(0, 430); x.quadraticCurveTo(260, 360, 520, 430);
  x.quadraticCurveTo(660, 470, 800, 440); x.lineTo(800, 600); x.lineTo(0, 600); x.closePath(); x.fill();
  x.fillStyle = '#4a90d9';
  x.fillRect(0, 470, 800, 130);
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 5; i++) {
    const y = 490 + i * 18;
    x.beginPath(); x.moveTo(60, y); x.quadraticCurveTo(200, y - 8, 360, y);
    x.quadraticCurveTo(560, y + 8, 740, y - 4); x.strokeStyle = 'rgba(255,255,255,.7)';
    x.lineWidth = 3; x.stroke();
  }
  // House
  x.fillStyle = '#f2e3c6'; x.fillRect(150, 330, 150, 110);
  x.fillStyle = '#c65b4e';
  x.beginPath(); x.moveTo(135, 332); x.lineTo(225, 265); x.lineTo(315, 332); x.closePath(); x.fill();
  x.fillStyle = '#6b4a2f'; x.fillRect(210, 375, 32, 65);
  x.fillStyle = '#9fd8ff'; x.fillRect(165, 355, 30, 30); x.fillRect(255, 355, 30, 30);
  // Tree
  x.fillStyle = '#6b4a2f'; x.fillRect(520, 340, 22, 100);
  x.fillStyle = '#2f7d32';
  x.beginPath(); x.arc(531, 310, 55, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(495, 340, 38, 0, Math.PI * 2); x.fill();
  x.beginPath(); x.arc(568, 340, 38, 0, Math.PI * 2); x.fill();
  // Boat
  x.fillStyle = '#8b5a2b';
  x.beginPath(); x.moveTo(430, 520); x.lineTo(580, 520); x.lineTo(555, 545); x.lineTo(455, 545); x.closePath(); x.fill();
  x.fillStyle = '#fff8e1';
  x.beginPath(); x.moveTo(505, 520); x.lineTo(505, 470); x.lineTo(545, 520); x.closePath(); x.fill();
  return c;
}

// --- Events ----------------------------------------------------------------------
els.chooseBtn.addEventListener('click', (e) => { e.stopPropagation(); els.fileInput.click(); });
els.dropZone.addEventListener('click', (e) => {
  if (e.target.closest('button')) return;
  els.fileInput.click();
});
els.dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
});
els.fileInput.addEventListener('change', () => {
  if (els.fileInput.files && els.fileInput.files[0]) handleFile(els.fileInput.files[0]);
  els.fileInput.value = '';
});
els.dropZone.addEventListener('dragover', (e) => { e.preventDefault(); els.dropZone.classList.add('dragging'); });
els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragging'));
els.dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  els.dropZone.classList.remove('dragging');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
els.sampleBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  clearError();
  loadImageObject(makeSamplePhoto(), SAMPLE_NAME, 0);
  els.fileNameInput.value = 'sample-photo';
});

els.rotLeft.addEventListener('click', () => { transform = rotateState(transform, -1); render(); });
els.rotRight.addEventListener('click', () => { transform = rotateState(transform, +1); render(); });
els.flipHBtn.addEventListener('click', () => { transform = flipState(transform, 'h'); render(); });
els.flipVBtn.addEventListener('click', () => { transform = flipState(transform, 'v'); render(); });
els.resetBtn.addEventListener('click', resetAll);
els.changeBtn.addEventListener('click', () => {
  source = null;
  els.editorSection.hidden = true;
  els.uploadSection.hidden = false;
  clearError();
});

const showOriginal = (on) => { showingOriginal = on; render(); };
els.compareBtn.addEventListener('pointerdown', () => showOriginal(true));
els.compareBtn.addEventListener('pointerup', () => showOriginal(false));
els.compareBtn.addEventListener('pointerleave', () => showOriginal(false));
els.compareBtn.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); showOriginal(true); }
});
els.compareBtn.addEventListener('keyup', () => showOriginal(false));

els.formatSelect.addEventListener('change', () => {
  els.qualityField.hidden = els.formatSelect.value !== 'jpeg';
});
els.qualitySlider.addEventListener('input', () => {
  els.qualityVal.textContent = fmtNum(els.qualitySlider.value);
});

els.downloadBtn.addEventListener('click', () => {
  if (!source) return;
  const format = els.formatSelect.value;
  const mime = exportMime(format);
  const quality = format === 'jpeg' ? clampQuality(Number(els.qualitySlider.value)) : undefined;
  els.canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(els.fileNameInput.value, format);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, mime, quality);
});

els.langToggle.addEventListener('click', () => {
  lang = lang === 'en' ? 'bn' : 'en';
  store(LS_LANG, lang);
  applyStrings();
});

// --- Init -------------------------------------------------------------------------
(function init() {
  const savedLang = readStore(LS_LANG);
  if (savedLang === 'bn' || savedLang === 'en') lang = savedLang;
  const savedSettings = readStore(LS_SETTINGS);
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings);
      settings = clampSettings(parsed);
      if (!isDefaultSettings(settings)) activePreset = 'normal';
    } catch { /* corrupted saved settings: keep defaults */ }
  }
  applyStrings();
  els.qualityVal.textContent = fmtNum(els.qualitySlider.value);
})();
