/* ============================================================
   generator.js – Core math & SVG path generation
   ============================================================
   All functions are pure (no DOM side effects).
   They operate only on data passed as arguments.

   Key responsibilities
   ─────────────────────
   hash / smoothNoise  – deterministic noise helpers
   getLineY            – compute normalised Y position for one point
                         on one line, given the two boundary curves
   generateLinePoints  – array of {x,y} for a full line
   pointsToBezierPath  – Catmull-Rom → cubic Bézier SVG path string
   lineColor           – HSLa colour for a line at position t
   generateSVGPaths    – assemble all path descriptors for one frame
   ============================================================ */

'use strict';

/* ── Noise utilities ──────────────────────────────────────── */

/**
 * Deterministic pseudo-random hash.
 * Returns a float in [0, 1).
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function hash(a, b) {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

/**
 * Smooth value noise via bilinear interpolation of a hash grid.
 * Returns a float in [-1, 1].
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function smoothNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;

  // Smooth-step (Ken Perlin's fade)
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash(ix,     iy    );
  const b = hash(ix + 1, iy    );
  const c = hash(ix,     iy + 1);
  const d = hash(ix + 1, iy + 1);

  const lerp = (p, q, t) => p + (q - p) * t;
  // Bilinear interpolation, remap [0,1] → [-1,1]
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}

/* ── Wave / boundary math ─────────────────────────────────── */

/**
 * Compute the normalised Y position [0..1] for a single point.
 *
 * The algorithm uses TWO boundary curves (A = top, B = bottom).
 * All intermediate lines are linearly interpolated between them,
 * replicating the Illustrator "Blend" effect.
 *
 * Each boundary is a two-harmonic wave so the curves are organic
 * without being fully random. A gentle phase offset between the
 * two boundaries creates the characteristic converging/diverging
 * bundle pattern.
 *
 * @param {number} xFrac       Horizontal position 0..1
 * @param {number} lineT       Which line: 0 = top boundary, 1 = bottom
 * @param {object} params      Current parameter state
 * @param {number} time        Animation phase offset
 * @returns {number}           Normalised y [approx 0..1]
 */
function getLineY(xFrac, lineT, params, time) {
  const {
    amplitude,
    tension,
    spread,
    noiseAmount,
    animationStrength,
    noiseSeed,
    curl,
    wiggle,
  } = params;

  const TAU = Math.PI * 2;

  // Vertical centres of the two boundary curves
  const centerA = 0.5 - spread * 0.5;   // top boundary
  const centerB = 0.5 + spread * 0.5;   // bottom boundary

  // Animated phase offset – drives the "breathing" animation
  const animPhase = time * (animationStrength || 0.6);

  // ── Boundary A (top): two harmonics ─────────────────────
  const waveA =
    Math.sin(xFrac * TAU * tension       + animPhase          ) * 0.70 +
    Math.sin(xFrac * TAU * tension * 1.6 + animPhase * 0.65 + 1.1) * 0.30;

  // ── Boundary B (bottom): shifted phase, slightly different freq ─
  // The 0.45 rad phase offset + 0.83 freq ratio creates the blend fan
  const waveB =
    Math.sin(xFrac * TAU * tension * 0.83 + animPhase * 0.88 + 0.45) * 0.70 +
    Math.sin(xFrac * TAU * tension * 1.6  + animPhase * 1.10 + 2.6 ) * 0.30;

  // Actual Y positions of the two boundaries at this x
  const yA = centerA + waveA * amplitude;
  const yB = centerB + waveB * amplitude;

  // Linearly interpolate for this line
  let y = yA + (yB - yA) * lineT;

  // ── Curl: inward (−) / outward (+) bow effect ───────────
  // Each line bows proportionally to its distance from centre
  // and follows a sine envelope along x so it tapers at edges.
  if (curl) {
    const curlVal = curl || 0;
    const deviation = lineT - 0.5;  // −0.5 (top) to +0.5 (bottom)
    const envelope  = Math.sin(xFrac * Math.PI);  // 0 at edges, 1 at centre
    y += curlVal * deviation * envelope * amplitude * 2.0;
  }

  // ── Wiggle: high-frequency serpentine undulation ─────────
  // Adds snake-like waviness per line with varied phase offsets.
  if (wiggle) {
    const wigVal = wiggle || 0;
    y += wigVal * Math.sin(
      xFrac * TAU * tension * 2.5 + lineT * 9.7 + animPhase * 0.7
    ) * amplitude * 0.45;
  }

  // ── Structured noise (subtle organic variation) ──────────
  if (noiseAmount > 0) {
    const seed = noiseSeed || 0;
    y += smoothNoise(
      xFrac * 7.3 + lineT * 2.9 + seed,
      lineT * 5.1 + xFrac * 1.8 + seed * 0.61
    ) * noiseAmount;
  }

  return y;
}

/* ── Point array generation ───────────────────────────────── */

/**
 * Build an array of {x, y} pixel positions for one line.
 *
 * @param {number} lineT       Interpolation param: 0 = top, 1 = bottom
 * @param {object} params
 * @param {number} width       Canvas width  (px)
 * @param {number} height      Canvas height (px)
 * @param {number} time        Animation time
 * @returns {{x:number, y:number}[]}
 */
function generateLinePoints(lineT, params, width, height, time) {
  const steps = Math.max(3, params.steps || 10);
  const pts = [];

  for (let s = 0; s <= steps; s++) {
    const xFrac = s / steps;
    const yFrac = getLineY(xFrac, lineT, params, time);
    pts.push({ x: xFrac * width, y: yFrac * height });
  }

  return pts;
}

/* ── SVG path building ────────────────────────────────────── */

/**
 * Convert a point array into a smooth SVG cubic Bézier path string.
 *
 * Uses the Catmull-Rom → cubic Bézier conversion so the path
 * passes through every control point with C1 continuity.
 *
 * @param {{x:number, y:number}[]} pts
 * @returns {string}  SVG `d` attribute value
 */
function pointsToBezierPath(pts) {
  if (pts.length < 2) return '';

  const f = (n) => n.toFixed(1);   // 1 decimal place keeps SVG compact
  const segs = [`M ${f(pts[0].x)} ${f(pts[0].y)}`];

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    // Catmull-Rom control-point factor (1/6 gives natural smoothness)
    const k = 1 / 6;
    const cp1x = p1.x + (p2.x - p0.x) * k;
    const cp1y = p1.y + (p2.y - p0.y) * k;
    const cp2x = p2.x - (p3.x - p1.x) * k;
    const cp2y = p2.y - (p3.y - p1.y) * k;

    segs.push(`C ${f(cp1x)} ${f(cp1y)} ${f(cp2x)} ${f(cp2y)} ${f(p2.x)} ${f(p2.y)}`);
  }

  return segs.join(' ');
}

/* ── Colour ───────────────────────────────────────────────── */

/**
 * Compute an HSLa colour string for a line at normalised position t.
 * The hue is interpolated between hueStart and hueEnd.
 *
 * @param {number} t      0 (top boundary) → 1 (bottom boundary)
 * @param {object} params
 * @returns {string}      e.g. "hsla(215.5,68%,65%,0.75)"
 */
function lineColor(t, params) {
  const { hueStart, hueEnd, saturation, lightness, opacity } = params;
  const rawHue = hueStart + (hueEnd - hueStart) * t;
  const hue = ((rawHue % 360) + 360) % 360;    // wrap to [0,360)
  return `hsla(${hue.toFixed(1)},${saturation}%,${lightness}%,${opacity})`;
}

/* ── Main entry point ─────────────────────────────────────── */

/**
 * Generate all SVG path descriptors for one frame.
 *
 * Returns an array of objects; each has the data needed to
 * create one <path> element:  { d, color, strokeWidth }
 *
 * Extension point: add more keys here (e.g. dasharray, filter id)
 * without changing the caller in app.js.
 *
 * @param {object} params
 * @param {number} width
 * @param {number} height
 * @param {number} time    Animation phase (0 when static)
 * @returns {{d:string, color:string, strokeWidth:number}[]}
 */
function generateSVGPaths(params, width, height, time) {
  const { lineCount, strokeWidth } = params;
  const paths = [];

  for (let i = 0; i < lineCount; i++) {
    const t = lineCount > 1 ? i / (lineCount - 1) : 0.5;
    const pts  = generateLinePoints(t, params, width, height, time);
    const d    = pointsToBezierPath(pts);
    const color = lineColor(t, params);
    paths.push({ d, color, strokeWidth });
  }

  return paths;
}
