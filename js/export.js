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
