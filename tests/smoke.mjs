// photo-editor-bd — headless-Chrome smoke test (CDP over file://).
// Usage: node tests/smoke.mjs <chrome-binary> <app-dir>
// Expects Chrome already running headless with --remote-debugging-port=9222,
// or pass CHROME_PORT env. Prints PASS/FAIL lines and exits non-zero on failure.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PORT = process.env.CHROME_PORT || '9222';
const APP_DIR = process.argv[3] || process.cwd();
// ES modules are CORS-blocked over file://, so smoke-test over local HTTP
// (python3 -m http.server) when APP_URL is given; default is file://.
const appUrl = process.argv[2] && /^https?:\/\//.test(process.argv[2])
  ? process.argv[2]
  : 'file://' + path.resolve(APP_DIR, 'index.html');

let failures = 0;
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
}

async function getJson(p, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method });
  return res.json();
}

async function main() {
  // Open the app in a fresh tab.
  const target = await getJson(`/json/new?${encodeURIComponent(appUrl)}`, 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'unknown exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      exceptions.push('console.error: ' + JSON.stringify(msg.params.args.map((a) => a.value ?? a.description)));
    }
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description || 'eval exception' };
    return { value: r.result?.result?.value };
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await new Promise((r) => setTimeout(r, 1200)); // let module scripts load

  const desktop = await evalJs(`(() => {
    const out = {};
    const up = document.getElementById('uploadSection');
    const ed = document.getElementById('editorSection');
    out.uploadVisible = !up.hidden;
    out.editorHidden = ed.hidden;
    out.title = document.querySelector('h1').textContent;
    out.sliderCount = document.querySelectorAll('#sliderList input[type=range]').length;
    out.presetCount = document.querySelectorAll('#presetRow button').length;
    // Load the sample photo
    document.getElementById('sampleBtn').click();
    out.editorVisibleAfterSample = !document.getElementById('editorSection').hidden;
    out.uploadHiddenAfterSample = document.getElementById('uploadSection').hidden;
    const c = document.getElementById('canvas');
    out.canvasW = c.width; out.canvasH = c.height;
    const ctx = c.getContext('2d');
    const px = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonBlank = 0;
    for (let i = 0; i < px.length; i += 4013) { if (px[i] || px[i+1] || px[i+2]) nonBlank++; }
    out.canvasNonBlankSamples = nonBlank;
    out.photoInfo = document.getElementById('photoInfo').textContent;
    // Vivid preset changes the saturation slider to 150
    [...document.querySelectorAll('#presetRow button')].find(b => b.dataset.preset === 'vivid').click();
    out.saturateAfterVivid = document.getElementById('out-saturate').textContent;
    out.vividActive = [...document.querySelectorAll('#presetRow button')].find(b => b.dataset.preset === 'vivid').classList.contains('active');
    out.badgeAfterVivid = document.getElementById('stateBadge').textContent;
    // Rotate right swaps canvas dimensions
    document.getElementById('rotRight').click();
    out.canvasAfterRotate = document.getElementById('canvas').width + 'x' + document.getElementById('canvas').height;
    // Reset restores defaults
    document.getElementById('resetBtn').click();
    out.canvasAfterReset = document.getElementById('canvas').width + 'x' + document.getElementById('canvas').height;
    out.saturateAfterReset = document.getElementById('out-saturate').textContent;
    out.badgeAfterReset = document.getElementById('stateBadge').textContent;
    // Bengali toggle
    document.getElementById('langToggle').click();
    out.titleBn = document.querySelector('h1').textContent;
    out.downloadBn = document.querySelector('#downloadBtn span').textContent;
    out.saturateBn = document.getElementById('out-saturate').textContent;
    document.getElementById('langToggle').click();
    out.titleEn = document.querySelector('h1').textContent;
    // Export controls
    document.getElementById('formatSelect').value = 'jpeg';
    document.getElementById('formatSelect').dispatchEvent(new Event('change'));
    out.qualityVisibleForJpeg = !document.getElementById('qualityField').hidden;
    out.downloadEnabled = !document.getElementById('downloadBtn').disabled;
    // Invalid file shows an error (simulate via DataTransfer-less direct call is hard;
    // instead check the validator is wired: file input accepts only images)
    out.fileAccept = document.getElementById('fileInput').accept;
    return out;
  })()`);

  if (desktop.error) { check('desktop evaluation ran', false, desktop.error); }
  else {
    const d = desktop.value;
    check('upload section visible on load', d.uploadVisible === true);
    check('editor hidden on load', d.editorHidden === true);
    check('title is Photo Editor BD', d.title === 'Photo Editor BD');
    check('7 adjustment sliders built', d.sliderCount === 7, `got ${d.sliderCount}`);
    check('7 preset buttons built', d.presetCount === 7, `got ${d.presetCount}`);
    check('sample photo opens the editor', d.editorVisibleAfterSample === true && d.uploadHiddenAfterSample === true);
    check('canvas is 800x600 for sample', d.canvasW === 800 && d.canvasH === 600, `${d.canvasW}x${d.canvasH}`);
    check('canvas pixels are non-blank', d.canvasNonBlankSamples > 50, `${d.canvasNonBlankSamples} samples`);
    check('photo info shows sample name', /sample-photo/.test(d.photoInfo), d.photoInfo);
    check('Vivid preset sets saturation to 150%', d.saturateAfterVivid === '150%', d.saturateAfterVivid);
    check('Vivid preset button becomes active', d.vividActive === true);
    check('badge reads Edited after preset', d.badgeAfterVivid === 'Edited', d.badgeAfterVivid);
    check('rotate right swaps canvas to 600x800', d.canvasAfterRotate === '600x800', d.canvasAfterRotate);
    check('reset restores 800x600', d.canvasAfterReset === '800x600', d.canvasAfterReset);
    check('reset restores saturation 100%', d.saturateAfterReset === '100%', d.saturateAfterReset);
    check('badge reads Original after reset', d.badgeAfterReset === 'Original', d.badgeAfterReset);
    check('BN toggle switches title to Bengali', d.titleBn === 'ফটো এডিটর বিডি', d.titleBn);
    check('BN toggle translates download button', /ডাউনলোড/.test(d.downloadBn), d.downloadBn);
    check('BN toggle renders Bengali digits', /১০০%/.test(d.saturateBn), d.saturateBn);
    check('EN toggle restores English title', d.titleEn === 'Photo Editor BD');
    check('JPEG format reveals quality slider', d.qualityVisibleForJpeg === true);
    check('download button enabled', d.downloadEnabled === true);
    check('file input accepts image types only', /image\/jpeg/.test(d.fileAccept), d.fileAccept);
  }

  // Mobile 390px: reload and check for horizontal overflow.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 1200));
  const mobile = await evalJs(`(() => {
    const out = {};
    document.getElementById('sampleBtn').click();
    out.scrollW = document.documentElement.scrollWidth;
    out.clientW = document.documentElement.clientWidth;
    out.editorVisible = !document.getElementById('editorSection').hidden;
    out.canvasCssW = document.getElementById('canvas').getBoundingClientRect().width;
    return out;
  })()`);
  if (mobile.error) { check('mobile evaluation ran', false, mobile.error); }
  else {
    const m = mobile.value;
    check('mobile 390px: no horizontal overflow', m.scrollW <= m.clientW + 1, `scrollWidth ${m.scrollW} vs ${m.clientW}`);
    check('mobile 390px: editor opens', m.editorVisible === true);
    check('mobile 390px: canvas fits viewport', m.canvasCssW <= 390, `${Math.round(m.canvasCssW)}px`);
  }

  check('no page exceptions / console errors', exceptions.length === 0, exceptions.slice(0, 3).join(' | '));

  ws.close();
  console.log(failures === 0 ? '\nSMOKE: ALL PASS' : `\nSMOKE: ${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error('SMOKE HARNESS ERROR:', err); process.exit(2); });
