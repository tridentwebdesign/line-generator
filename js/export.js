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
  const btn = document.getElementById('btn-lib');
  const origText = btn ? btn.textContent : '';

  // Show progress
  function setProgress(text) {
    if (btn) {
      btn.textContent = text;
      btn.disabled = true;
    }
  }
  function resetBtn() {
    if (btn) {
      btn.textContent = origText;
      btn.disabled = false;
    }
  }

  try {
    setProgress('生成中…');

    // Snapshot current layers (visible only, deep copy params)
    const layerData = state.layers
      .filter(function(l) { return l.visible; })
      .map(function(l) { return { params: Object.assign({}, l.params) }; });

    if (layerData.length === 0) {
      resetBtn();
      alert('表示中のレイヤーがありません。');
      return;
    }

    const layersJSON = JSON.stringify(layerData, null, 2);

    // Use setTimeout to allow the button text to repaint before heavy work
    setTimeout(function() {
      try {
        setProgress('ファイル構築中…');

        const parts = [];
        parts.push('<!DOCTYPE html>');
        parts.push('<html lang="ja">');
        parts.push('<head>');
        parts.push('<meta charset="UTF-8">');
        parts.push('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
        parts.push('<title>SVG Line Background</title>');
        parts.push('<style>');
        parts.push('  * { margin: 0; padding: 0; box-sizing: border-box; }');
        parts.push('  html, body { width: 100%; height: 100%; overflow: hidden; }');
        parts.push('  body { background: #000; }');
        parts.push('  #slg-bg { position: fixed; inset: 0; width: 100%; height: 100%; z-index: -1; }');
        parts.push('  #slg-bg svg { display: block; width: 100%; height: 100%; }');
        parts.push('</style>');
        parts.push('</head>');
        parts.push('<body>');
        parts.push('');
        parts.push('<!--');
        parts.push('  SVG Line Background \u2013 Generated by SVG Line Generator');
        parts.push('  https://tridentwebdesign.github.io/line-generator/');
        parts.push('');
        parts.push('  \u4f7f\u3044\u65b9:');
        parts.push('  1) \u3053\u306e\u30d5\u30a1\u30a4\u30eb\u3092\u305d\u306e\u307e\u307e <iframe> \u3067\u57cb\u3081\u8fbc\u3080:');
        parts.push('     <iframe src="line-bg.html" style="position:fixed;inset:0;width:100%;height:100%;border:none;z-index:-1;pointer-events:none"><\/iframe>');
        parts.push('');
        parts.push('  2) \u307e\u305f\u306f <div id="slg-bg"><\/div> \u3068 <script> \u90e8\u5206\u3060\u3051\u3092');
        parts.push('     \u65e2\u5b58\u30da\u30fc\u30b8\u306b\u30b3\u30d4\u30fc\u3057\u3066\u4f7f\u7528\u3067\u304d\u307e\u3059\u3002');
        parts.push('');
        parts.push('  3) \u30a2\u30cb\u30e1\u30fc\u30b7\u30e7\u30f3\u3092\u6b62\u3081\u305f\u3044\u5834\u5408\u306f SLG.stop() \u3092\u547c\u3073\u51fa\u3057\u3001');
        parts.push('     \u518d\u958b\u306f SLG.start() \u3067\u3059\u3002');
        parts.push('-->');
        parts.push('');
        parts.push('<div id="slg-bg"></div>');
        parts.push('');
        parts.push('<script>');
        parts.push('"use strict";');
        parts.push('');
        parts.push('var SLG = (function() {');
        parts.push('');
        parts.push('  var LAYERS = ' + layersJSON + ';');
        parts.push('');
        parts.push('  function hash(a, b) {');
        parts.push('    var n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;');
        parts.push('    return n - Math.floor(n);');
        parts.push('  }');
        parts.push('');
        parts.push('  function smoothNoise(x, y) {');
        parts.push('    var ix = Math.floor(x), iy = Math.floor(y);');
        parts.push('    var fx = x - ix, fy = y - iy;');
        parts.push('    var ux = fx * fx * (3 - 2 * fx);');
        parts.push('    var uy = fy * fy * (3 - 2 * fy);');
        parts.push('    var a = hash(ix, iy), b = hash(ix + 1, iy);');
        parts.push('    var c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);');
        parts.push('    var lerp = function(p, q, t) { return p + (q - p) * t; };');
        parts.push('    return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;');
        parts.push('  }');
        parts.push('');
        parts.push('  function getLineY(xFrac, lineT, params, time) {');
        parts.push('    var amp = params.amplitude, ten = params.tension;');
        parts.push('    var spr = params.spread, noise = params.noiseAmount;');
        parts.push('    var seed = params.noiseSeed || 0;');
        parts.push('    var str = params.animationStrength;');
        parts.push('    var TAU = Math.PI * 2;');
        parts.push('    var cA = 0.5 - spr * 0.5, cB = 0.5 + spr * 0.5;');
        parts.push('    var ph = time * (str || 0.6);');
        parts.push('    var wA = Math.sin(xFrac * TAU * ten + ph) * 0.70 +');
        parts.push('            Math.sin(xFrac * TAU * ten * 1.6 + ph * 0.65 + 1.1) * 0.30;');
        parts.push('    var wB = Math.sin(xFrac * TAU * ten * 0.83 + ph * 0.88 + 0.45) * 0.70 +');
        parts.push('            Math.sin(xFrac * TAU * ten * 1.6 + ph * 1.10 + 2.6) * 0.30;');
        parts.push('    var yA = cA + wA * amp, yB = cB + wB * amp;');
        parts.push('    var y = yA + (yB - yA) * lineT;');
        parts.push('    if (noise > 0) {');
        parts.push('      y += smoothNoise(xFrac * 7.3 + lineT * 2.9 + seed,');
        parts.push('        lineT * 5.1 + xFrac * 1.8 + seed * 0.61) * noise;');
        parts.push('    }');
        parts.push('    return y;');
        parts.push('  }');
        parts.push('');
        parts.push('  function genPoints(lineT, p, w, h, t) {');
        parts.push('    var steps = Math.max(3, p.steps || 10), pts = [];');
        parts.push('    for (var s = 0; s <= steps; s++) {');
        parts.push('      var xF = s / steps;');
        parts.push('      pts.push({ x: xF * w, y: getLineY(xF, lineT, p, t) * h });');
        parts.push('    }');
        parts.push('    return pts;');
        parts.push('  }');
        parts.push('');
        parts.push('  function ptsToBezier(pts) {');
        parts.push('    if (pts.length < 2) return "";');
        parts.push('    var f = function(n) { return n.toFixed(1); };');
        parts.push('    var s = ["M " + f(pts[0].x) + " " + f(pts[0].y)];');
        parts.push('    for (var i = 0; i < pts.length - 1; i++) {');
        parts.push('      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i];');
        parts.push('      var p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];');
        parts.push('      var k = 1 / 6;');
        parts.push('      s.push("C " + f(p1.x + (p2.x - p0.x) * k) + " " +');
        parts.push('        f(p1.y + (p2.y - p0.y) * k) + " " +');
        parts.push('        f(p2.x - (p3.x - p1.x) * k) + " " +');
        parts.push('        f(p2.y - (p3.y - p1.y) * k) + " " +');
        parts.push('        f(p2.x) + " " + f(p2.y));');
        parts.push('    }');
        parts.push('    return s.join(" ");');
        parts.push('  }');
        parts.push('');
        parts.push('  function lineColor(t, p) {');
        parts.push('    var h = p.hueStart + (p.hueEnd - p.hueStart) * t;');
        parts.push('    h = ((h % 360) + 360) % 360;');
        parts.push('    return "hsla(" + h.toFixed(1) + "," + p.saturation + "%," +');
        parts.push('           p.lightness + "%," + p.opacity + ")";');
        parts.push('  }');
        parts.push('');
        parts.push('  function genPaths(p, w, h, t) {');
        parts.push('    var lc = p.lineCount, sw = p.strokeWidth, out = [];');
        parts.push('    for (var i = 0; i < lc; i++) {');
        parts.push('      var lt = lc > 1 ? i / (lc - 1) : 0.5;');
        parts.push('      out.push({ d: ptsToBezier(genPoints(lt, p, w, h, t)),');
        parts.push('        color: lineColor(lt, p), strokeWidth: sw });');
        parts.push('    }');
        parts.push('    return out;');
        parts.push('  }');
        parts.push('');
        parts.push('  function angleScale(W, H, deg) {');
        parts.push('    var r = Math.abs(deg) * (Math.PI / 180);');
        parts.push('    var c = Math.cos(r), s = Math.sin(r);');
        parts.push('    return Math.max((W * c + H * s) / W, (W * s + H * c) / H, 1);');
        parts.push('  }');
        parts.push('');
        parts.push('  var NS = "http://www.w3.org/2000/svg";');
        parts.push('  var container, svgEl, animTime = 0, rafId = null, running = false, lastTs = null;');
        parts.push('');
        parts.push('  function render(time) {');
        parts.push('    if (!svgEl) return;');
        parts.push('    var rect = svgEl.getBoundingClientRect();');
        parts.push('    var W = rect.width, H = rect.height;');
        parts.push('    if (W === 0 || H === 0) return;');
        parts.push('    svgEl.setAttribute("viewBox", "0 0 " + W + " " + H);');
        parts.push('    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);');
        parts.push('    var bgColor = LAYERS[0] ? LAYERS[0].params.backgroundColor : "#080c14";');
        parts.push('    var bg = document.createElementNS(NS, "rect");');
        parts.push('    bg.setAttribute("width", W); bg.setAttribute("height", H);');
        parts.push('    bg.setAttribute("fill", bgColor); svgEl.appendChild(bg);');
        parts.push('    for (var li = 0; li < LAYERS.length; li++) {');
        parts.push('      var layer = LAYERS[li], g = document.createElementNS(NS, "g");');
        parts.push('      var angle = layer.params.angle || 0;');
        parts.push('      if (Math.abs(angle) > 0.01) {');
        parts.push('        var cx = W / 2, cy = H / 2, sc = angleScale(W, H, angle);');
        parts.push('        g.setAttribute("transform",');
        parts.push('          "translate(" + cx + "," + cy + ") rotate(" + angle +');
        parts.push('          ") scale(" + sc + ") translate(" + (-cx) + "," + (-cy) + ")");');
        parts.push('      }');
        parts.push('      var paths = genPaths(layer.params, W, H, time);');
        parts.push('      for (var pi = 0; pi < paths.length; pi++) {');
        parts.push('        var pp = paths[pi];');
        parts.push('        var path = document.createElementNS(NS, "path");');
        parts.push('        path.setAttribute("d", pp.d);');
        parts.push('        path.setAttribute("stroke", pp.color);');
        parts.push('        path.setAttribute("stroke-width", pp.strokeWidth);');
        parts.push('        path.setAttribute("fill", "none");');
        parts.push('        path.setAttribute("stroke-linecap", "round");');
        parts.push('        path.setAttribute("stroke-linejoin", "round");');
        parts.push('        path.setAttribute("vector-effect", "non-scaling-stroke");');
        parts.push('        g.appendChild(path);');
        parts.push('      }');
        parts.push('      svgEl.appendChild(g);');
        parts.push('    }');
        parts.push('  }');
        parts.push('');
        parts.push('  function loop(ts) {');
        parts.push('    if (lastTs !== null) {');
        parts.push('      var speed = LAYERS[0] ? (LAYERS[0].params.animationSpeed || 1) : 1;');
        parts.push('      animTime += ((ts - lastTs) / 1000) * speed * 0.38;');
        parts.push('    }');
        parts.push('    lastTs = ts; render(animTime);');
        parts.push('    rafId = requestAnimationFrame(loop);');
        parts.push('  }');
        parts.push('');
        parts.push('  function start() {');
        parts.push('    if (running) return; running = true; lastTs = null;');
        parts.push('    rafId = requestAnimationFrame(loop);');
        parts.push('  }');
        parts.push('  function stop() {');
        parts.push('    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }');
        parts.push('    running = false; lastTs = null;');
        parts.push('  }');
        parts.push('');
        parts.push('  function init() {');
        parts.push('    container = document.getElementById("slg-bg");');
        parts.push('    if (!container) return;');
        parts.push('    svgEl = document.createElementNS(NS, "svg");');
        parts.push('    svgEl.setAttribute("xmlns", NS);');
        parts.push('    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");');
        parts.push('    svgEl.style.display = "block";');
        parts.push('    svgEl.style.width = "100%"; svgEl.style.height = "100%";');
        parts.push('    container.appendChild(svgEl);');
        parts.push('    start();');
        parts.push('    if (typeof ResizeObserver !== "undefined") {');
        parts.push('      new ResizeObserver(function() { if (!running) render(animTime); }).observe(svgEl);');
        parts.push('    }');
        parts.push('  }');
        parts.push('');
        parts.push('  if (document.readyState === "loading") {');
        parts.push('    document.addEventListener("DOMContentLoaded", init);');
        parts.push('  } else { init(); }');
        parts.push('');
        parts.push('  return { start: start, stop: stop, layers: LAYERS };');
        parts.push('');
        parts.push('})();');
        parts.push('<\/script>');
        parts.push('</body>');
        parts.push('</html>');

        const html = parts.join('\n');

        setProgress('ダウンロード中…');

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        triggerDownload(url, 'line-bg.html');

        setTimeout(resetBtn, 600);

      } catch (err) {
        resetBtn();
        console.error('Library export error:', err);
        alert('ライブラリ生成に失敗しました: ' + err.message);
      }
    }, 50);  // 50 ms delay so button text repaints

  } catch (err) {
    resetBtn();
    console.error('Library export error:', err);
    alert('ライブラリ生成に失敗しました: ' + err.message);
  }
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
