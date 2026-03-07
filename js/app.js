/* ============================================================
   app.js – Application state, render loop, animation
   ============================================================
   v2 additions
   ─────────────
   • Multi-layer support: state.layers[] array, each layer
     holds its own params + visibility + name.
   • state.params and state.activePreset are virtual properties
     (getter/setter) that proxy to the active layer, so all
     existing code in ui.js / export.js continues to work.
   • Angle transform: render() wraps each layer's paths in a
     <g> with rotate+scale; vector-effect="non-scaling-stroke"
     keeps stroke widths constant under the scale.
   • addLayer / removeLayer / setActiveLayer /
     toggleLayerVisibility – called by ui.js
   ============================================================ */

'use strict';

/* ── Default parameter set ────────────────────────────────── */

const DEFAULTS = {
  // Structure
  lineCount:         40,
  steps:             10,
  strokeWidth:       1.5,

  // Shape
  amplitude:         0.13,
  tension:           1.0,
  spread:            0.65,
  noiseAmount:       0.014,
  noiseSeed:         0,
  angle:             0,       // degrees  –180 … 180

  // Colour
  hueStart:          198,
  hueEnd:            255,
  saturation:        68,
  lightness:         66,
  opacity:           0.74,

  // Scene
  backgroundColor:   '#080c14',

  // Animation
  animationSpeed:    0.85,
  animationStrength: 0.60,
};

/* ── Layer factory ────────────────────────────────────────── */

/**
 * Create a new layer object with a copy of the default params.
 * @param {string} name
 * @returns {{ id:number, name:string, visible:boolean,
 *             params:object, activePreset:string|null }}
 */
function createLayer(name) {
  return {
    id:           Date.now() + Math.random(),
    name,
    visible:      true,
    params:       { ...DEFAULTS },
    activePreset: null,
  };
}

/* ── App state ────────────────────────────────────────────── */

const state = {
  layers:           [],   // array of layer objects (see createLayer)
  activeLayerIndex: 0,
  animating:        false,
  animTime:         0,    // accumulated animation phase
  animRafId:        null,
};

/**
 * Virtual property: proxies to the active layer's params.
 * All existing code that reads/writes state.params continues
 * to work without modification.
 */
Object.defineProperty(state, 'params', {
  get() {
    return state.layers[state.activeLayerIndex]?.params ?? {};
  },
  set(v) {
    const l = state.layers[state.activeLayerIndex];
    if (l) l.params = v;
  },
  enumerable: true,
});

/**
 * Virtual property: proxies to the active layer's activePreset.
 */
Object.defineProperty(state, 'activePreset', {
  get() {
    return state.layers[state.activeLayerIndex]?.activePreset ?? null;
  },
  set(v) {
    const l = state.layers[state.activeLayerIndex];
    if (l) l.activePreset = v;
  },
  enumerable: true,
});

/* ── Angle transform helper ───────────────────────────────── */

/**
 * Compute the scale factor needed so that content drawn in a
 * W×H canvas fully covers the viewport after rotating by angleDeg.
 *
 * Uses the formula: scale = max(
 *   (W·|cosθ| + H·|sinθ|) / W,
 *   (W·|sinθ| + H·|cosθ|) / H
 * )
 *
 * Combined with vector-effect="non-scaling-stroke" on each <path>,
 * this ensures lines fill edge-to-edge at any angle while stroke
 * widths remain visually constant.
 *
 * @param {number} W         Viewport width
 * @param {number} H         Viewport height
 * @param {number} angleDeg  Rotation in degrees
 * @returns {number}
 */
function getAngleScale(W, H, angleDeg) {
  const θ     = Math.abs(angleDeg) * (Math.PI / 180);
  const cosθ  = Math.cos(θ);
  const sinθ  = Math.sin(θ);
  const sX    = (W * cosθ + H * sinθ) / W;
  const sY    = (W * sinθ + H * cosθ) / H;
  return Math.max(sX, sY, 1);
}

/* ── Render ───────────────────────────────────────────────── */

/**
 * Clear and redraw the SVG for all visible layers.
 *
 * Layer order: index 0 = bottom (drawn first).
 * Background colour comes from the bottommost visible layer.
 *
 * @param {number} [time]
 */
function render(time) {
  if (time === undefined) time = state.animTime;

  const svg = document.getElementById('preview-svg');
  if (!svg) return;

  const rect = svg.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  if (W === 0 || H === 0) return;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Fast clear
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const NS = 'http://www.w3.org/2000/svg';

  // Background: use bottom-most visible layer's colour
  const firstVisible = state.layers.find(l => l.visible);
  const bgColor = firstVisible ? firstVisible.params.backgroundColor : '#080c14';

  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width',  W);
  bg.setAttribute('height', H);
  bg.setAttribute('fill',   bgColor);
  svg.appendChild(bg);

  // Draw each layer (bottom → top)
  for (const layer of state.layers) {
    if (!layer.visible) continue;

    const g = document.createElementNS(NS, 'g');

    // Apply rotation + scale transform when angle is non-zero
    const angle = layer.params.angle || 0;
    if (Math.abs(angle) > 0.01) {
      const cx    = W / 2;
      const cy    = H / 2;
      const scale = getAngleScale(W, H, angle);
      // Transform order: move origin to centre → rotate → scale → restore
      g.setAttribute(
        'transform',
        `translate(${cx},${cy}) rotate(${angle}) scale(${scale}) translate(${-cx},${-cy})`
      );
    }

    const paths = generateSVGPaths(layer.params, W, H, time);

    for (const { d, color, strokeWidth } of paths) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d',               d);
      path.setAttribute('stroke',          color);
      path.setAttribute('stroke-width',    strokeWidth);
      path.setAttribute('fill',            'none');
      path.setAttribute('stroke-linecap',  'round');
      path.setAttribute('stroke-linejoin', 'round');
      // Keep stroke width constant under the scale transform
      path.setAttribute('vector-effect',   'non-scaling-stroke');
      g.appendChild(path);
    }

    svg.appendChild(g);
  }
}

/* ── Animation loop ───────────────────────────────────────── */

function startAnimation() {
  if (state.animRafId !== null) return;
  state.animating = true;
  let lastTs = null;

  function loop(ts) {
    if (lastTs !== null) {
      const dt = (ts - lastTs) / 1000;
      // Use the active layer's speed (they all share the same phase)
      state.animTime += dt * (state.params.animationSpeed || 1) * 0.38;
    }
    lastTs = ts;
    render(state.animTime);
    state.animRafId = requestAnimationFrame(loop);
  }

  state.animRafId = requestAnimationFrame(loop);
  updateAnimButton();
}

function stopAnimation() {
  if (state.animRafId !== null) {
    cancelAnimationFrame(state.animRafId);
    state.animRafId = null;
  }
  state.animating = false;
  updateAnimButton();
}

function toggleAnimation() {
  if (state.animating) stopAnimation();
  else startAnimation();
}

function updateAnimButton() {
  const btn = document.getElementById('btn-toggle-anim');
  if (!btn) return;
  if (state.animating) {
    btn.textContent = '⏹ Stop';
    btn.classList.add('active');
  } else {
    btn.textContent = '▶ Animate';
    btn.classList.remove('active');
  }
}

/* ── Layer management ─────────────────────────────────────── */

/**
 * Add a new layer above the current active layer.
 * New layer gets default params with hue shifted +60° for variety.
 */
function addLayer() {
  const idx  = state.layers.length + 1;
  const layer = createLayer(`Layer ${idx}`);

  // Shift hue +60° relative to the current top layer for instant contrast
  const topLayer = state.layers[state.layers.length - 1];
  if (topLayer) {
    layer.params.hueStart = (topLayer.params.hueStart + 60) % 360;
    layer.params.hueEnd   = (topLayer.params.hueEnd   + 60) % 360;
  }

  state.layers.push(layer);
  state.activeLayerIndex = state.layers.length - 1;

  refreshLayerUI();
  updateUI();
  updatePresetButtons();
  if (!state.animating) render();
}

/**
 * Remove the layer at the given index.
 * Keeps at least one layer.
 * @param {number} index
 */
function removeLayer(index) {
  if (state.layers.length <= 1) return;
  state.layers.splice(index, 1);
  state.activeLayerIndex = Math.min(state.activeLayerIndex, state.layers.length - 1);
  refreshLayerUI();
  updateUI();
  updatePresetButtons();
  if (!state.animating) render();
}

/**
 * Set the active (selected) layer.
 * Updates all sliders to reflect the new layer's params.
 * @param {number} index
 */
function setActiveLayer(index) {
  if (index < 0 || index >= state.layers.length) return;
  state.activeLayerIndex = index;
  refreshLayerUI();
  updateUI();
  updatePresetButtons();
}

/**
 * Toggle a layer's visibility.
 * @param {number} index
 */
function toggleLayerVisibility(index) {
  const l = state.layers[index];
  if (l) l.visible = !l.visible;
  refreshLayerUI();
  if (!state.animating) render();
}

/* ── Randomize ────────────────────────────────────────────── */

function randomize() {
  const r  = (lo, hi) => lo + Math.random() * (hi - lo);
  const ri = (lo, hi) => Math.round(r(lo, hi));

  const spread  = r(0.40, 0.82);
  const amp     = Math.min(r(0.06, 0.26), (1 - spread) * 0.5 + 0.04);

  state.params = {
    ...state.params,      // preserve animation + angle settings
    lineCount:    ri(12, 65),
    steps:        ri(6,  14),
    strokeWidth:  r(0.6, 2.8),
    amplitude:    amp,
    tension:      r(0.4, 2.2),
    spread,
    noiseAmount:  r(0.003, 0.038),
    noiseSeed:    r(0, 100),
    hueStart:     ri(0,  360),
    hueEnd:       ri(0,  360),
    saturation:   ri(40, 92),
    lightness:    ri(48, 78),
    opacity:      r(0.50, 0.95),
  };

  state.activePreset = null;
  updateUI();
  updatePresetButtons();
  if (!state.animating) render();
}

/* ── Reset ────────────────────────────────────────────────── */

function resetToDefault() {
  applyPreset('Calm Wave');
}

/* ── Init ─────────────────────────────────────────────────── */

function init() {
  // Create the initial layer
  state.layers           = [createLayer('Layer 1')];
  state.activeLayerIndex = 0;

  // Build UI (order matters: layer panel first, then sliders)
  buildLayerPanel();
  buildControlPanel();
  buildPresetButtons();

  // Apply default preset (also calls updateUI + updatePresetButtons)
  applyPreset('Calm Wave');

  // Action buttons
  document.getElementById('btn-randomize')
    .addEventListener('click', randomize);

  document.getElementById('btn-reset')
    .addEventListener('click', resetToDefault);

  document.getElementById('btn-toggle-anim')
    .addEventListener('click', toggleAnimation);

  document.getElementById('btn-svg')
    .addEventListener('click', () => downloadSVG());

  document.getElementById('btn-png')
    .addEventListener('click', () => downloadPNG());

  // Sidebar collapse
  document.getElementById('sidebar-toggle')
    .addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('collapsed');
      setTimeout(() => { if (!state.animating) render(); }, 280);
    });

  // Re-render on resize
  const ro = new ResizeObserver(() => { if (!state.animating) render(); });
  ro.observe(document.getElementById('preview-svg'));

  render();
}

document.addEventListener('DOMContentLoaded', init);
