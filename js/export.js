/* ============================================================
   export.js – SVG and PNG download utilities
   ============================================================
   v2 changes
   ───────────
   • buildExportSVG() now iterates state.layers (all visible
     layers) instead of rendering a single params set.
   • Angle transform is applied per-layer (matches render()).
   • downloadSVG() / downloadPNG() no longer need params arg.
   ============================================================ */

'use strict';

const EXPORT_W = 1920;
const EXPORT_H = 1080;

/* ── Build standalone SVG ─────────────────────────────────── */

/**
 * Construct a detached <svg> element containing all visible
 * layers at the given export dimensions.
 *
 * Mirrors the render() function in app.js exactly, so exports
 * always match what the user sees on screen.
 *
 * @param {number} W  Export width  (px)
 * @param {number} H  Export height (px)
 * @returns {SVGElement}
 */
function buildExportSVG(W, H) {
  const NS  = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('xmlns',   NS);
  svg.setAttribute('width',   W);
  svg.setAttribute('height',  H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Background colour: from the bottom-most visible layer
  const firstVisible = state.layers.find(l => l.visible);
  const bgColor = firstVisible ? firstVisible.params.backgroundColor : '#080c14';

  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width',  W);
  bg.setAttribute('height', H);
  bg.setAttribute('fill',   bgColor);
  svg.appendChild(bg);

  // Draw each visible layer (bottom → top)
  for (const layer of state.layers) {
    if (!layer.visible) continue;

    const g = document.createElementNS(NS, 'g');

    // Apply angle transform if needed (mirrors app.js render logic)
    const angle = layer.params.angle || 0;
    if (Math.abs(angle) > 0.01) {
      const cx    = W / 2;
      const cy    = H / 2;
      const scale = getAngleScale(W, H, angle);
      g.setAttribute(
        'transform',
        `translate(${cx},${cy}) rotate(${angle}) scale(${scale}) translate(${-cx},${-cy})`
      );
    }

    // Render at current animation phase so exports match screen
    const paths = generateSVGPaths(layer.params, W, H, state.animTime);

    for (const { d, color, strokeWidth } of paths) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d',               d);
      path.setAttribute('stroke',          color);
      path.setAttribute('stroke-width',    strokeWidth);
      path.setAttribute('fill',            'none');
      path.setAttribute('stroke-linecap',  'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('vector-effect',   'non-scaling-stroke');
      g.appendChild(path);
    }

    svg.appendChild(g);
  }

  return svg;
}

function svgToString(svgEl) {
  return new XMLSerializer().serializeToString(svgEl);
}

/* ── SVG download ─────────────────────────────────────────── */

function downloadSVG() {
  const markup = svgToString(buildExportSVG(EXPORT_W, EXPORT_H));
  const blob   = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(URL.createObjectURL(blob), 'line-art.svg');
}

/* ── PNG download ─────────────────────────────────────────── */

function downloadPNG() {
  const W = EXPORT_W;
  const H = EXPORT_H;

  const markup = svgToString(buildExportSVG(W, H));
  const blob   = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' });
  const objUrl = URL.createObjectURL(blob);

  const img = new Image();

  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Fill background before drawing (for alpha safety)
    const firstVisible = state.layers.find(l => l.visible);
    ctx.fillStyle = firstVisible ? firstVisible.params.backgroundColor : '#080c14';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    URL.revokeObjectURL(objUrl);

    try {
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          alert('PNG generation failed. Please use SVG export instead.');
          return;
        }
        triggerDownload(URL.createObjectURL(pngBlob), 'line-art.png');
      }, 'image/png');
    } catch (e) {
      alert('PNG export is unavailable here. Use SVG export and convert externally.');
    }
  };

  img.onerror = () => {
    URL.revokeObjectURL(objUrl);
    alert('Could not render image for PNG export. Try SVG instead.');
  };

  img.src = objUrl;
}

/* ── Embeddable library download ──────────────────────────── */

/**
 * Export the current animation as a self-contained HTML file
 * that can be used as an animated website background.
 *
 * The generated file includes:
 *  - All math functions from generator.js (inlined)
 *  - getAngleScale helper
 *  - Current layer configurations (baked in)
 *  - A responsive SVG render + animation loop
 *  - CSS to make the SVG a fixed fullscreen background
 *
 * Usage: drop the file into an <iframe>, or copy the <script>
 * into any page with a container element.
 */
function downloadLibrary() {
  // Snapshot current layers (visible only, deep copy params)
  const layerData = state.layers
    .filter(l => l.visible)
    .map(l => ({
      params: { ...l.params },
    }));

  if (layerData.length === 0) {
    alert('表示中のレイヤーがありません。');
    return;
  }

  const layersJSON = JSON.stringify(layerData, null, 2);

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SVG Line Background</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body { background: #000; }
  #slg-bg {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: -1;
  }
  #slg-bg svg {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
</head>
<body>

<!--
  SVG Line Background – Generated by SVG Line Generator
  https://tridentwebdesign.github.io/line-generator/

  使い方:
  ─────────────────────────────────────────────────────
  1) このファイルをそのまま <iframe> で埋め込む:
     <iframe src="line-bg.html" style="position:fixed;inset:0;width:100%;height:100%;border:none;z-index:-1;pointer-events:none"></iframe>

  2) または <div id="slg-bg"></div> と <script> 部分だけを
     既存ページにコピーして使用できます。

  3) アニメーションを止めたい場合は SLG.stop() を呼び出し、
     再開は SLG.start() です。
-->

<div id="slg-bg"></div>

<script>
'use strict';

/* ============================================================
   SVG Line Background – Standalone Runtime
   ============================================================ */

var SLG = (function() {

  /* ── Baked-in layer data ─────────────────────────────────── */
  var LAYERS = ${layersJSON};

  /* ── Noise utilities ─────────────────────────────────────── */

  function hash(a, b) {
    var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function smoothNoise(x, y) {
    var ix = Math.floor(x);
    var iy = Math.floor(y);
    var fx = x - ix;
    var fy = y - iy;
    var ux = fx * fx * (3 - 2 * fx);
    var uy = fy * fy * (3 - 2 * fy);
    var a = hash(ix, iy);
    var b = hash(ix + 1, iy);
    var c = hash(ix, iy + 1);
    var d = hash(ix + 1, iy + 1);
    var lerp = function(p, q, t) { return p + (q - p) * t; };
    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
  }

  /* ── Wave math ───────────────────────────────────────────── */

  function getLineY(xFrac, lineT, params, time) {
    var amplitude = params.amplitude;
    var tension   = params.tension;
    var spread    = params.spread;
    var noiseAmount = params.noiseAmount;
    var noiseSeed = params.noiseSeed || 0;
    var animationStrength = params.animationStrength;
    var TAU = Math.PI * 2;

    var centerA = 0.5 - spread * 0.5;
    var centerB = 0.5 + spread * 0.5;
    var animPhase = time * (animationStrength || 0.6);

    var waveA =
      Math.sin(xFrac * TAU * tension + animPhase) * 0.70 +
      Math.sin(xFrac * TAU * tension * 1.6 + animPhase * 0.65 + 1.1) * 0.30;

    var waveB =
      Math.sin(xFrac * TAU * tension * 0.83 + animPhase * 0.88 + 0.45) * 0.70 +
      Math.sin(xFrac * TAU * tension * 1.6 + animPhase * 1.10 + 2.6) * 0.30;

    var yA = centerA + waveA * amplitude;
    var yB = centerB + waveB * amplitude;
    var y = yA + (yB - yA) * lineT;

    if (noiseAmount > 0) {
      y += smoothNoise(
        xFrac * 7.3 + lineT * 2.9 + noiseSeed,
        lineT * 5.1 + xFrac * 1.8 + noiseSeed * 0.61
      ) * noiseAmount;
    }
    return y;
  }

  /* ── Point & path generation ─────────────────────────────── */

  function generateLinePoints(lineT, params, width, height, time) {
    var steps = Math.max(3, params.steps || 10);
    var pts = [];
    for (var s = 0; s <= steps; s++) {
      var xFrac = s / steps;
      var yFrac = getLineY(xFrac, lineT, params, time);
      pts.push({ x: xFrac * width, y: yFrac * height });
    }
    return pts;
  }

  function pointsToBezierPath(pts) {
    if (pts.length < 2) return '';
    var f = function(n) { return n.toFixed(1); };
    var segs = ['M ' + f(pts[0].x) + ' ' + f(pts[0].y)];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[Math.min(pts.length - 1, i + 2)];
      var k = 1 / 6;
      var cp1x = p1.x + (p2.x - p0.x) * k;
      var cp1y = p1.y + (p2.y - p0.y) * k;
      var cp2x = p2.x - (p3.x - p1.x) * k;
      var cp2y = p2.y - (p3.y - p1.y) * k;
      segs.push('C ' + f(cp1x) + ' ' + f(cp1y) + ' ' +
                 f(cp2x) + ' ' + f(cp2y) + ' ' +
                 f(p2.x) + ' ' + f(p2.y));
    }
    return segs.join(' ');
  }

  function lineColor(t, params) {
    var hueStart = params.hueStart;
    var hueEnd   = params.hueEnd;
    var rawHue = hueStart + (hueEnd - hueStart) * t;
    var hue = ((rawHue % 360) + 360) % 360;
    return 'hsla(' + hue.toFixed(1) + ',' +
           params.saturation + '%,' +
           params.lightness + '%,' +
           params.opacity + ')';
  }

  function generateSVGPaths(params, width, height, time) {
    var lineCount = params.lineCount;
    var strokeWidth = params.strokeWidth;
    var paths = [];
    for (var i = 0; i < lineCount; i++) {
      var t = lineCount > 1 ? i / (lineCount - 1) : 0.5;
      var pts = generateLinePoints(t, params, width, height, time);
      var d = pointsToBezierPath(pts);
      var color = lineColor(t, params);
      paths.push({ d: d, color: color, strokeWidth: strokeWidth });
    }
    return paths;
  }

  /* ── Angle transform helper ──────────────────────────────── */

  function getAngleScale(W, H, angleDeg) {
    var rad  = Math.abs(angleDeg) * (Math.PI / 180);
    var cosR = Math.cos(rad);
    var sinR = Math.sin(rad);
    var sX   = (W * cosR + H * sinR) / W;
    var sY   = (W * sinR + H * cosR) / H;
    return Math.max(sX, sY, 1);
  }

  /* ── Render ──────────────────────────────────────────────── */

  var NS = 'http://www.w3.org/2000/svg';
  var container, svgEl;
  var animTime = 0;
  var rafId = null;
  var running = false;

  function render(time) {
    if (!svgEl) return;
    var rect = svgEl.getBoundingClientRect();
    var W = rect.width;
    var H = rect.height;
    if (W === 0 || H === 0) return;

    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

    var bgColor = LAYERS[0] ? LAYERS[0].params.backgroundColor : '#080c14';
    var bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', W);
    bg.setAttribute('height', H);
    bg.setAttribute('fill', bgColor);
    svgEl.appendChild(bg);

    for (var li = 0; li < LAYERS.length; li++) {
      var layer = LAYERS[li];
      var g = document.createElementNS(NS, 'g');

      var angle = layer.params.angle || 0;
      if (Math.abs(angle) > 0.01) {
        var cx = W / 2;
        var cy = H / 2;
        var scale = getAngleScale(W, H, angle);
        g.setAttribute('transform',
          'translate(' + cx + ',' + cy + ') rotate(' + angle +
          ') scale(' + scale + ') translate(' + (-cx) + ',' + (-cy) + ')');
      }

      var paths = generateSVGPaths(layer.params, W, H, time);
      for (var pi = 0; pi < paths.length; pi++) {
        var p = paths[pi];
        var path = document.createElementNS(NS, 'path');
        path.setAttribute('d', p.d);
        path.setAttribute('stroke', p.color);
        path.setAttribute('stroke-width', p.strokeWidth);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        g.appendChild(path);
      }
      svgEl.appendChild(g);
    }
  }

  /* ── Animation loop ──────────────────────────────────────── */

  var lastTs = null;

  function loop(ts) {
    if (lastTs !== null) {
      var dt = (ts - lastTs) / 1000;
      var speed = LAYERS[0] ? (LAYERS[0].params.animationSpeed || 1) : 1;
      animTime += dt * speed * 0.38;
    }
    lastTs = ts;
    render(animTime);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    lastTs = null;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    running = false;
    lastTs = null;
  }

  /* ── Init ────────────────────────────────────────────────── */

  function init() {
    container = document.getElementById('slg-bg');
    if (!container) return;

    svgEl = document.createElementNS(NS, 'svg');
    svgEl.setAttribute('xmlns', NS);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgEl.style.display = 'block';
    svgEl.style.width   = '100%';
    svgEl.style.height  = '100%';
    container.appendChild(svgEl);

    start();

    /* Resize handling */
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(function() {
        if (!running) render(animTime);
      }).observe(svgEl);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* ── Public API ──────────────────────────────────────────── */

  return {
    start:  start,
    stop:   stop,
    layers: LAYERS,
  };

})();
<` + `/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  triggerDownload(URL.createObjectURL(blob), 'line-bg.html');
}

/* ── Helper ───────────────────────────────────────────────── */

function triggerDownload(objectUrl, filename) {
  const a = document.createElement('a');
  a.href     = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
