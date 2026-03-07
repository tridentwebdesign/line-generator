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
  lineCount:         62,
  steps:             22,
  strokeWidth:       1.9,

  // Shape
  amplitude:         0.15,
  tension:           3.0,
  spread:            0.15,
  noiseAmount:       0.024,
  noiseSeed:         0,
  angle:             -18,     // degrees  –180 … 180

  // Colour
  hueStart:          9,
  hueEnd:            273,
  saturation:        59,
  lightness:         62,
  opacity:           0.68,

  // Scene
  backgroundColor:   '#ffffff',

  // Animation
  animationSpeed:    1.0,
  animationStrength: 0.40,
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

  // Zoom / pan – view-only transform, does not affect generation or export
  zoom:  1.0,
  panX:  0,
  panY:  0,
  svgW:  0,   // natural pixel width  stored in render(), used by zoom math
  svgH:  0,   // natural pixel height
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

  // Store natural dimensions for zoom/pan math
  state.svgW = W;
  state.svgH = H;

  // Apply zoom / pan via viewBox.
  // Paths are always generated in the full W×H space; the viewBox
  // determines which portion is visible on screen.
  const viewW = W / state.zoom;
  const viewH = H / state.zoom;
  svg.setAttribute('viewBox', `${state.panX} ${state.panY} ${viewW} ${viewH}`);

  // Fast clear
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const NS = 'http://www.w3.org/2000/svg';

  // Background: covers the current viewport (tracks pan/zoom)
  const firstVisible = state.layers.find(l => l.visible);
  const bgColor = firstVisible ? firstVisible.params.backgroundColor : '#080c14';

  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('x',      state.panX);
  bg.setAttribute('y',      state.panY);
  bg.setAttribute('width',  viewW);
  bg.setAttribute('height', viewH);
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
  state.params       = { ...DEFAULTS };
  state.activePreset = null;
  updateUI();
  updatePresetButtons();
  if (!state.animating) render();
}

/* ── Zoom / Pan ───────────────────────────────────────────── */

/**
 * Core zoom helper: adjusts zoom and pan so that the point at
 * screen-pixel position (mx, my) inside the SVG element remains
 * fixed after the zoom.
 *
 * Derivation:
 *   svgCoord = panX + mx / zoom          (screen px → SVG user unit)
 *   after zoom:  newPanX + mx / newZoom = svgCoord
 *   ∴ newPanX = panX + mx × (1/zoom − 1/newZoom)
 *
 * For button zoom (no cursor), pass mx = svgW/2, my = svgH/2
 * to keep the canvas centre fixed.
 *
 * @param {number} mx      X position in SVG element screen pixels
 * @param {number} my      Y position in SVG element screen pixels
 * @param {number} factor  Zoom multiplier (>1 = in, <1 = out)
 */
function zoomAt(mx, my, factor) {
  const newZoom = Math.max(0.1, Math.min(10, state.zoom * factor));
  const inv     = 1 / state.zoom - 1 / newZoom;
  state.panX   += mx * inv;
  state.panY   += my * inv;
  state.zoom    = newZoom;
  updateZoomLabel();
  if (!state.animating) render();
}

/** Zoom in 25 %, centred on canvas centre. */
function zoomIn()  { zoomAt(state.svgW / 2, state.svgH / 2, 1.25); }

/** Zoom out 25 %, centred on canvas centre. */
function zoomOut() { zoomAt(state.svgW / 2, state.svgH / 2, 1 / 1.25); }

/** Reset zoom to 100 % and clear any pan offset. */
function zoomReset() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  updateZoomLabel();
  if (!state.animating) render();
}

/** Sync the zoom percentage badge in the zoom bar. */
function updateZoomLabel() {
  const el = document.getElementById('zoom-label');
  if (el) el.textContent = Math.round(state.zoom * 100) + '%';
}

/**
 * Attach all zoom / pan event listeners to the preview area.
 * Called once from init().
 */
function setupZoomInteraction() {
  const area = document.getElementById('preview-area');
  const svg  = document.getElementById('preview-svg');
  if (!area || !svg) return;

  // ── Mouse-wheel zoom (centred on cursor) ────────────────
  area.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!state.svgW) return;

    const r  = svg.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;

    // Normalize cross-browser delta
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(mx, my, factor);
  }, { passive: false });

  // ── Drag to pan ──────────────────────────────────────────
  let isPanning = false;
  let panLastX, panLastY;

  svg.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isPanning = true;
    panLastX  = e.clientX;
    panLastY  = e.clientY;
    svg.classList.add('panning');
    e.preventDefault();   // prevent text selection while dragging
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    const dx = e.clientX - panLastX;
    const dy = e.clientY - panLastY;
    // Convert screen-pixel delta to SVG user-unit delta
    state.panX -= dx / state.zoom;
    state.panY -= dy / state.zoom;
    panLastX = e.clientX;
    panLastY = e.clientY;
    if (!state.animating) render();
  });

  document.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      svg.classList.remove('panning');
    }
  });

  // ── Keyboard shortcuts ───────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn(); }
    if (e.key === '-')                  { e.preventDefault(); zoomOut(); }
    if (e.key === '0')                  { e.preventDefault(); zoomReset(); }
  });

  // ── Zoom bar buttons ─────────────────────────────────────
  document.getElementById('zoom-in')   ?.addEventListener('click', zoomIn);
  document.getElementById('zoom-out')  ?.addEventListener('click', zoomOut);
  document.getElementById('zoom-reset')?.addEventListener('click', zoomReset);
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

  // Sync UI to DEFAULTS (no preset pre-selected)
  updateUI();
  updatePresetButtons();

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

  // Zoom / pan interaction
  setupZoomInteraction();

  render();
}

document.addEventListener('DOMContentLoaded', init);
