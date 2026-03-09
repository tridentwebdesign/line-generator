/* ============================================================
   ui.js – Control panel, layer UI, event binding
   ============================================================ */

'use strict';

/* ── Control sections ─────────────────────────────────────── */

const CONTROL_SECTIONS = [
  {
    label: '構造',
    controls: [
      { key: 'lineCount',   label: 'ライン数',   min: 3,    max: 120,  step: 1,     decimals: 0 },
      { key: 'steps',       label: 'なめらかさ', min: 3,    max: 22,   step: 1,     decimals: 0 },
      { key: 'strokeWidth', label: '線の太さ',   min: 0.2,  max: 6,    step: 0.1,   decimals: 1 },
    ],
  },
  {
    label: '形状',
    controls: [
      { key: 'amplitude',   label: '振幅',       min: 0.01, max: 0.50, step: 0.01,  decimals: 2 },
      { key: 'tension',     label: 'テンション', min: 0.15, max: 3.0,  step: 0.05,  decimals: 2 },
      { key: 'spread',      label: '広がり',     min: 0.05, max: 1.0,  step: 0.01,  decimals: 2 },
      { key: 'noiseAmount', label: 'ノイズ',     min: 0,    max: 0.08, step: 0.002, decimals: 3 },
      { key: 'curl',        label: 'カール',     min: -1.0, max: 1.0,  step: 0.01,  decimals: 2 },
      { key: 'wiggle',      label: 'うねり',     min: 0,    max: 1.0,  step: 0.01,  decimals: 2 },
      { key: 'angle',       label: '角度 °',     min: -180, max: 180,  step: 1,     decimals: 0 },
    ],
  },
  {
    label: 'カラー',
    controls: [
      { key: 'hueStart',   label: '色相（開始）', min: 0,    max: 360,  step: 1,     decimals: 0 },
      { key: 'hueEnd',     label: '色相（終了）', min: 0,    max: 360,  step: 1,     decimals: 0 },
      { key: 'saturation', label: '彩度',         min: 0,    max: 100,  step: 1,     decimals: 0 },
      { key: 'lightness',  label: '明度',         min: 15,   max: 95,   step: 1,     decimals: 0 },
      { key: 'opacity',    label: '不透明度',     min: 0.05, max: 1.0,  step: 0.01,  decimals: 2 },
    ],
  },
  {
    label: 'アニメーション',
    controls: [
      { key: 'animationSpeed',    label: 'スピード', min: 0.05, max: 4.0, step: 0.05, decimals: 2 },
      { key: 'animationStrength', label: '強度',     min: 0.05, max: 2.5, step: 0.05, decimals: 2 },
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
    // Insert at the very top, before the controls section
    sidebarContent.insertBefore(panel, sidebarContent.firstChild);
  }

  panel.innerHTML = '';

  const storageKey = 'slg-sec-レイヤー';
  const saved      = localStorage.getItem(storageKey);
  const collapsed  = saved === 'true';  // default open

  const sec = document.createElement('div');
  sec.className = 'section' + (collapsed ? ' sec-collapsed' : '');

  // Header row: label + Add button + chevron (entire row is toggle target)
  const headerRow = document.createElement('div');
  headerRow.className = 'section-toggle-header';
  headerRow.style.cursor = 'pointer';

  const lbl = document.createElement('div');
  lbl.className   = 'section-label';
  lbl.textContent = 'レイヤー';

  const addBtn = document.createElement('button');
  addBtn.className = 'layer-add-icon-btn';
  addBtn.title     = 'レイヤーを追加';
  addBtn.textContent = '＋';
  // stopPropagation so clicking ＋ does NOT toggle collapse
  addBtn.addEventListener('click', (e) => { e.stopPropagation(); addLayer(); });

  const chevron = document.createElement('span');
  chevron.className = 'section-chevron';
  chevron.innerHTML = CHEVRON_SVG;

  headerRow.appendChild(lbl);
  headerRow.appendChild(addBtn);
  headerRow.appendChild(chevron);
  sec.appendChild(headerRow);

  headerRow.addEventListener('click', () => {
    const nowCollapsed = sec.classList.toggle('sec-collapsed');
    localStorage.setItem(storageKey, nowCollapsed);
  });

  // Collapsible body
  const body = document.createElement('div');
  body.className = 'section-body';

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.height = '4px';
  body.appendChild(spacer);

  // Layer list container (rebuilt by refreshLayerUI)
  const list = document.createElement('div');
  list.id        = 'layer-list';
  list.className = 'layer-list';
  body.appendChild(list);

  sec.appendChild(body);
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
    visBtn.title = layer.visible ? 'レイヤーを非表示' : 'レイヤーを表示';
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

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.className = 'layer-del-btn';
    delBtn.title = 'レイヤーを削除';
    delBtn.innerHTML = '&#x2715;';
    delBtn.disabled = state.layers.length <= 1;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeLayer(index);
    });

    item.appendChild(visBtn);
    item.appendChild(namePart);
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
    const newName = input.value.trim() || `レイヤー ${index + 1}`;
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

/** Sections collapsed by default on first load */
const DEFAULT_COLLAPSED_SECTIONS = new Set(['アニメーション', '背景']);

/** Chevron SVG string */
const CHEVRON_SVG = '<svg width="8" height="5" viewBox="0 0 8 5" fill="currentColor"><path d="M0 0l4 5 4-5H0z"/></svg>';

/**
 * Create a collapsible section wrapper.
 * @param {string} label       Section heading text
 * @param {boolean} [forceOpen] If true, ignore localStorage (used for fresh installs)
 * @returns {{ sec, body, header }}
 */
function createCollapsibleSection(label) {
  const storageKey  = `slg-sec-${label}`;
  const saved       = localStorage.getItem(storageKey);
  const collapsed   = saved !== null
    ? saved === 'true'
    : DEFAULT_COLLAPSED_SECTIONS.has(label);

  const sec = document.createElement('div');
  sec.className = 'section' + (collapsed ? ' sec-collapsed' : '');

  const header = document.createElement('div');
  header.className = 'section-toggle-header';

  const lbl = document.createElement('div');
  lbl.className   = 'section-label';
  lbl.textContent = label;

  const chevron = document.createElement('span');
  chevron.className = 'section-chevron';
  chevron.innerHTML = CHEVRON_SVG;

  header.appendChild(lbl);
  header.appendChild(chevron);
  sec.appendChild(header);

  const body = document.createElement('div');
  body.className = 'section-body';
  sec.appendChild(body);

  header.addEventListener('click', () => {
    const nowCollapsed = sec.classList.toggle('sec-collapsed');
    localStorage.setItem(storageKey, nowCollapsed);
  });

  return { sec, body };
}

function buildControlPanel() {
  const container = document.getElementById('controls-container');
  if (!container) return;
  container.innerHTML = '';

  for (const section of CONTROL_SECTIONS) {
    const { sec, body } = createCollapsibleSection(section.label);

    for (const ctrl of section.controls) {
      body.appendChild(createSlider(ctrl));
    }

    container.appendChild(sec);
  }

  // Background colour picker (collapsible)
  const { sec: bgSec, body: bgBody } = createCollapsibleSection('背景');

  const row = document.createElement('div');
  row.className = 'color-row control-row';

  const txt = document.createElement('label');
  txt.className   = 'control-label';
  txt.htmlFor     = 'ctrl-backgroundColor';
  txt.textContent = '背景色';

  const swatch = document.createElement('div');
  swatch.className = 'color-swatch';

  const inp = document.createElement('input');
  inp.type  = 'color';
  inp.id    = 'ctrl-backgroundColor';
  inp.value = state.params.backgroundColor || '#080c14';
  inp.addEventListener('input', (e) => {
    state.params.backgroundColor = e.target.value;
    if (!state.animating) render();
  });

  swatch.appendChild(inp);
  row.appendChild(txt);
  row.appendChild(swatch);
  bgBody.appendChild(row);
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
