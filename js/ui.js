/* ============================================================
   ui.js – Control panel, presets, layer UI, event binding
   ============================================================
   v2 additions
   ─────────────
   • angle slider added to SHAPE section
   • buildLayerPanel() / refreshLayerUI() – inject/rebuild the
     layer management section at the top of the sidebar
   • All slider events + applyPreset write through state.params
     which proxies to the active layer (defined in app.js).
   ============================================================ */

'use strict';

/* ── Presets ──────────────────────────────────────────────── */

const PRESETS = {

  'Calm Wave': {
    lineCount:         35,
    steps:             10,
    strokeWidth:       1.2,
    amplitude:         0.12,
    tension:           1.0,
    spread:            0.65,
    noiseAmount:       0.012,
    noiseSeed:         3.7,
    angle:             0,
    hueStart:          195,
    hueEnd:            252,
    saturation:        66,
    lightness:         68,
    opacity:           0.73,
    backgroundColor:   '#080c14',
    animationSpeed:    0.82,
    animationStrength: 0.60,
  },

  'Ribbon Flow': {
    lineCount:         22,
    steps:             9,
    strokeWidth:       2.1,
    amplitude:         0.21,
    tension:           0.72,
    spread:            0.74,
    noiseAmount:       0.009,
    noiseSeed:         17.4,
    angle:             0,
    hueStart:          28,
    hueEnd:            340,
    saturation:        80,
    lightness:         65,
    opacity:           0.82,
    backgroundColor:   '#0f0810',
    animationSpeed:    0.52,
    animationStrength: 0.80,
  },

  'Dense Blend': {
    lineCount:         68,
    steps:             12,
    strokeWidth:       0.65,
    amplitude:         0.08,
    tension:           1.85,
    spread:            0.54,
    noiseAmount:       0.017,
    noiseSeed:         42.1,
    angle:             0,
    hueStart:          168,
    hueEnd:            218,
    saturation:        54,
    lightness:         70,
    opacity:           0.52,
    backgroundColor:   '#040810',
    animationSpeed:    1.20,
    animationStrength: 0.42,
  },

  'Aurora Lines': {
    lineCount:         45,
    steps:             11,
    strokeWidth:       1.5,
    amplitude:         0.17,
    tension:           0.88,
    spread:            0.84,
    noiseAmount:       0.024,
    noiseSeed:         61.5,
    angle:             0,
    hueStart:          122,
    hueEnd:            300,
    saturation:        84,
    lightness:         63,
    opacity:           0.68,
    backgroundColor:   '#030609',
    animationSpeed:    1.00,
    animationStrength: 0.72,
  },

  'Minimal Contour': {
    lineCount:         10,
    steps:             8,
    strokeWidth:       1.9,
    amplitude:         0.28,
    tension:           0.52,
    spread:            0.70,
    noiseAmount:       0.005,
    noiseSeed:         88.2,
    angle:             0,
    hueStart:          210,
    hueEnd:            226,
    saturation:        34,
    lightness:         78,
    opacity:           0.90,
    backgroundColor:   '#0a0c10',
    animationSpeed:    0.58,
    animationStrength: 1.00,
  },
};

/* ── Control sections ─────────────────────────────────────── */

const CONTROL_SECTIONS = [
  {
    label: 'STRUCTURE',
    controls: [
      { key: 'lineCount',   label: 'Line Count',   min: 3,    max: 120,  step: 1,     decimals: 0 },
      { key: 'steps',       label: 'Smoothness',   min: 3,    max: 22,   step: 1,     decimals: 0 },
      { key: 'strokeWidth', label: 'Stroke Width', min: 0.2,  max: 6,    step: 0.1,   decimals: 1 },
    ],
  },
  {
    label: 'SHAPE',
    controls: [
      { key: 'amplitude',   label: 'Amplitude',    min: 0.01, max: 0.50, step: 0.01,  decimals: 2 },
      { key: 'tension',     label: 'Tension',      min: 0.15, max: 3.0,  step: 0.05,  decimals: 2 },
      { key: 'spread',      label: 'Spread',       min: 0.05, max: 1.0,  step: 0.01,  decimals: 2 },
      { key: 'noiseAmount', label: 'Noise',        min: 0,    max: 0.08, step: 0.002, decimals: 3 },
      { key: 'angle',       label: 'Angle °',      min: -180, max: 180,  step: 1,     decimals: 0 },
    ],
  },
  {
    label: 'COLOUR',
    controls: [
      { key: 'hueStart',   label: 'Hue Start',    min: 0,    max: 360,  step: 1,     decimals: 0 },
      { key: 'hueEnd',     label: 'Hue End',      min: 0,    max: 360,  step: 1,     decimals: 0 },
      { key: 'saturation', label: 'Saturation',   min: 0,    max: 100,  step: 1,     decimals: 0 },
      { key: 'lightness',  label: 'Lightness',    min: 15,   max: 95,   step: 1,     decimals: 0 },
      { key: 'opacity',    label: 'Opacity',      min: 0.05, max: 1.0,  step: 0.01,  decimals: 2 },
    ],
  },
  {
    label: 'ANIMATION',
    controls: [
      { key: 'animationSpeed',    label: 'Speed',    min: 0.05, max: 4.0, step: 0.05, decimals: 2 },
      { key: 'animationStrength', label: 'Strength', min: 0.05, max: 2.5, step: 0.05, decimals: 2 },
    ],
  },
];

/* ── Layer panel ──────────────────────────────────────────── */

/**
 * Build (or rebuild) the LAYERS section and prepend it to
 * #sidebar-content. Creates a permanent #layer-panel container.
 */
function buildLayerPanel() {
  const sidebarContent = document.getElementById('sidebar-content');
  if (!sidebarContent) return;

  // Create or reuse the container
  let panel = document.getElementById('layer-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'layer-panel';
    // Insert at the very top, before the presets section
    sidebarContent.insertBefore(panel, sidebarContent.firstChild);
  }

  panel.innerHTML = '';

  const sec = document.createElement('div');
  sec.className = 'section';

  // Header row: label + Add button
  const headerRow = document.createElement('div');
  headerRow.className = 'section-header-row';

  const lbl = document.createElement('div');
  lbl.className = 'section-label';
  lbl.style.marginBottom = '0';
  lbl.textContent = 'LAYERS';

  const addBtn = document.createElement('button');
  addBtn.className = 'layer-add-icon-btn';
  addBtn.title = 'Add new layer';
  addBtn.textContent = '＋';
  addBtn.addEventListener('click', addLayer);

  headerRow.appendChild(lbl);
  headerRow.appendChild(addBtn);
  sec.appendChild(headerRow);

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.height = '8px';
  sec.appendChild(spacer);

  // Layer list container (rebuilt by refreshLayerUI)
  const list = document.createElement('div');
  list.id = 'layer-list';
  list.className = 'layer-list';
  sec.appendChild(list);

  panel.appendChild(sec);

  // Populate the list immediately
  refreshLayerUI();
}

/**
 * Rebuild just the layer list items without recreating the whole panel.
 * Called after add / remove / activate / visibility changes.
 */
function refreshLayerUI() {
  const list = document.getElementById('layer-list');
  if (!list) return;

  list.innerHTML = '';

  state.layers.forEach((layer, index) => {
    const item = document.createElement('div');
    item.className = 'layer-item' + (index === state.activeLayerIndex ? ' active' : '');

    // Click anywhere on the item (except buttons) → activate layer
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.layer-vis-btn') &&
          !e.target.closest('.layer-del-btn')) {
        setActiveLayer(index);
      }
    });

    // Visibility toggle
    const visBtn = document.createElement('button');
    visBtn.className = 'layer-vis-btn' + (layer.visible ? '' : ' off');
    visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    visBtn.innerHTML = layer.visible
      ? '<svg width="13" height="10" viewBox="0 0 13 10" fill="currentColor"><path d="M6.5 0C3.5 0 1 2 0 5c1 3 3.5 5 6.5 5S12 8 13 5C12 2 9.5 0 6.5 0zm0 8a3 3 0 110-6 3 3 0 010 6zm0-4.8a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6z"/></svg>'
      : '<svg width="13" height="10" viewBox="0 0 13 10" fill="currentColor" opacity="0.35"><path d="M6.5 0C3.5 0 1 2 0 5c1 3 3.5 5 6.5 5S12 8 13 5C12 2 9.5 0 6.5 0zm0 8a3 3 0 110-6 3 3 0 010 6zm0-4.8a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6z"/></svg>';
    visBtn.addEventListener('click', () => toggleLayerVisibility(index));

    // Layer name
    const namePart = document.createElement('span');
    namePart.className = 'layer-name';
    namePart.textContent = layer.name;
    // Double-click to rename inline
    namePart.addEventListener('dblclick', () => startRename(namePart, index));

    // Preset badge (small, shows which preset is active)
    const badge = document.createElement('span');
    badge.className = 'layer-preset-badge';
    badge.textContent = layer.activePreset ? layer.activePreset.split(' ')[0] : '';

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'layer-del-btn';
    delBtn.title = 'Delete layer';
    delBtn.innerHTML = '&#x2715;';
    delBtn.disabled = state.layers.length <= 1;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeLayer(index);
    });

    item.appendChild(visBtn);
    item.appendChild(namePart);
    item.appendChild(badge);
    item.appendChild(delBtn);
    list.appendChild(item);
  });
}

/**
 * Start inline renaming for a layer name element.
 * @param {HTMLElement} el    The .layer-name span
 * @param {number}      index Layer index
 */
function startRename(el, index) {
  const input = document.createElement('input');
  input.type        = 'text';
  input.value       = state.layers[index].name;
  input.className   = 'layer-rename-input';
  input.spellcheck  = false;

  el.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim() || `Layer ${index + 1}`;
    state.layers[index].name = newName;
    refreshLayerUI();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') { state.layers[index].name = input.value; commit(); }
    e.stopPropagation();
  });
}

/* ── Control panel (sliders) ──────────────────────────────── */

function buildControlPanel() {
  const container = document.getElementById('controls-container');
  if (!container) return;
  container.innerHTML = '';

  for (const section of CONTROL_SECTIONS) {
    const sec = document.createElement('div');
    sec.className = 'section';

    const lbl = document.createElement('div');
    lbl.className = 'section-label';
    lbl.textContent = section.label;
    sec.appendChild(lbl);

    for (const ctrl of section.controls) {
      sec.appendChild(createSlider(ctrl));
    }

    container.appendChild(sec);
  }

  // Background colour picker
  const bgSec = document.createElement('div');
  bgSec.className = 'section';

  const bgHdr = document.createElement('div');
  bgHdr.className = 'section-label';
  bgHdr.textContent = 'BACKGROUND';
  bgSec.appendChild(bgHdr);

  const row = document.createElement('div');
  row.className = 'color-row control-row';

  const txt = document.createElement('label');
  txt.className = 'control-label';
  txt.htmlFor   = 'ctrl-backgroundColor';
  txt.textContent = 'Background';

  const swatch = document.createElement('div');
  swatch.className = 'color-swatch';

  const inp = document.createElement('input');
  inp.type  = 'color';
  inp.id    = 'ctrl-backgroundColor';
  inp.value = state.params.backgroundColor || '#080c14';
  inp.addEventListener('input', (e) => {
    state.params.backgroundColor = e.target.value;
    state.activePreset = null;
    updatePresetButtons();
    if (!state.animating) render();
  });

  swatch.appendChild(inp);
  row.appendChild(txt);
  row.appendChild(swatch);
  bgSec.appendChild(row);
  container.appendChild(bgSec);
}

/* ── Slider factory ───────────────────────────────────────── */

function createSlider(ctrl) {
  const group = document.createElement('div');
  group.className = 'control-group';

  const row = document.createElement('div');
  row.className = 'control-row';

  const lbl = document.createElement('label');
  lbl.className   = 'control-label';
  lbl.htmlFor     = `ctrl-${ctrl.key}`;
  lbl.textContent = ctrl.label;

  const badge = document.createElement('span');
  badge.className   = 'control-value';
  badge.id          = `val-${ctrl.key}`;
  badge.textContent = (state.params[ctrl.key] ?? 0).toFixed(ctrl.decimals);

  row.appendChild(lbl);
  row.appendChild(badge);
  group.appendChild(row);

  const slider = document.createElement('input');
  slider.type  = 'range';
  slider.id    = `ctrl-${ctrl.key}`;
  slider.min   = ctrl.min;
  slider.max   = ctrl.max;
  slider.step  = ctrl.step;
  slider.value = state.params[ctrl.key] ?? 0;
  updateSliderFill(slider);

  slider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    state.params[ctrl.key] = val;
    badge.textContent = val.toFixed(ctrl.decimals);
    updateSliderFill(slider);
    state.activePreset = null;
    updatePresetButtons();
    if (!state.animating) render();
  });

  group.appendChild(slider);
  return group;
}

function updateSliderFill(slider) {
  const lo  = parseFloat(slider.min);
  const hi  = parseFloat(slider.max);
  const val = parseFloat(slider.value);
  const pct = ((val - lo) / (hi - lo) * 100).toFixed(1) + '%';
  slider.style.setProperty('--fill', pct);
}

/* ── Preset buttons ───────────────────────────────────────── */

function buildPresetButtons() {
  const grid = document.getElementById('preset-grid');
  if (!grid) return;
  grid.innerHTML = '';

  for (const name of Object.keys(PRESETS)) {
    const btn = document.createElement('button');
    btn.className      = 'preset-btn';
    btn.textContent    = name;
    btn.dataset.preset = name;
    btn.addEventListener('click', () => applyPreset(name));
    grid.appendChild(btn);
  }
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  state.params       = { ...state.params, ...preset };
  state.activePreset = name;
  updateUI();
  updatePresetButtons();
  if (!state.animating) render();
}

function updatePresetButtons() {
  const btns = document.querySelectorAll('.preset-btn');
  for (const btn of btns) {
    btn.classList.toggle('active', btn.dataset.preset === state.activePreset);
  }
}

/* ── Sync UI ──────────────────────────────────────────────── */

function updateUI() {
  for (const section of CONTROL_SECTIONS) {
    for (const ctrl of section.controls) {
      const slider = document.getElementById(`ctrl-${ctrl.key}`);
      const badge  = document.getElementById(`val-${ctrl.key}`);
      const val    = state.params[ctrl.key] ?? 0;
      if (slider) {
        slider.value = val;
        updateSliderFill(slider);
      }
      if (badge) badge.textContent = val.toFixed(ctrl.decimals);
    }
  }
  const bgInp = document.getElementById('ctrl-backgroundColor');
  if (bgInp) bgInp.value = state.params.backgroundColor || '#080c14';
}
