/**
 * sample.js — Keyframe interpolation engine.
 *
 * This is the ONLY source of truth for node position at a given time.
 * CSS transitions are never used for preview positioning.
 *
 * Model:
 *   node.track    = [{ t, x, y, ease }]   t is 0..1
 *   node.staggerMs (optional, default 0)  — delay before this node starts
 *   ease: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
 *   Interpolation uses the LEFT keyframe's ease function.
 *
 * Stagger:
 *   effectiveP = clamp((p * durationMs - staggerMs) / durationMs, 0, 1)
 *   Pass clip.durationMs as the third argument so stagger is applied correctly.
 */

/**
 * Apply an easing function to a raw 0..1 progress value.
 * @param {number} t     - Raw linear progress 0..1
 * @param {string} type  - Easing type
 * @returns {number}       Eased progress 0..1
 */
function easeValue(t, type) {
  switch (type) {
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'easeInOut':
      return t < 0.5
        ? 2 * t * t
        : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default: // 'linear'
      return t;
  }
}

/**
 * Sample node position at normalised playhead time p (0..1).
 *
 * @param {object} node       - Clip node with .track array and optional .staggerMs
 * @param {number} p          - Normalised time 0..1
 * @param {number} [durationMs] - Clip duration in ms (required for stagger to apply)
 * @returns {{ x: number, y: number }}
 */
function sample(node, p, durationMs) {
  // Apply stagger: delay this node's animation start by staggerMs.
  // effectiveP = clamp((p * durationMs - staggerMs) / durationMs, 0, 1)
  const staggerMs = node.staggerMs || 0;
  if (staggerMs > 0 && durationMs && durationMs > 0) {
    p = Math.max(0, Math.min(1, (p * durationMs - staggerMs) / durationMs));
  }

  // Sort a shallow copy so we don't mutate clip data
  const kfs = node.track.slice().sort((a, b) => a.t - b.t);

  if (kfs.length === 0) return { x: node.x, y: node.y };
  if (p <= kfs[0].t)   return { x: kfs[0].x, y: kfs[0].y };

  const last = kfs[kfs.length - 1];
  if (p >= last.t)     return { x: last.x, y: last.y };

  // Find left keyframe (highest index where kf.t <= p)
  let i = 0;
  while (i < kfs.length - 2 && kfs[i + 1].t <= p) i++;

  const a   = kfs[i];
  const b   = kfs[i + 1];
  const span = b.t - a.t;
  if (!span) return { x: a.x, y: a.y };
  const raw = (p - a.t) / span;   // 0..1 within this segment
  const et  = easeValue(raw, a.ease);     // apply left-keyframe easing

  return {
    x: a.x + (b.x - a.x) * et,
    y: a.y + (b.y - a.y) * et,
  };
}
