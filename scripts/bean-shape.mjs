/**
 * The bean's geometry. Imported, never duplicated.
 *
 * This used to live inside generate-bean.mjs. It moved out the moment a second
 * generator needed the same shape (the share card, scripts/generate-og.mjs).
 * DESIGN.md's rule for the mascot is that it has one source and many outputs --
 * "drawing the bean twice is how the favicon and the page stop matching" -- and
 * a second copy of these fifteen lines of trigonometry is exactly that failure
 * with extra steps.
 *
 * This module is pure: no I/O, no side effects, nothing written. Both
 * generators import it and decide for themselves what to emit.
 */

/**
 * Bean geometry.
 *
 * A filled ellipse with a sine-wave fissure carved out of it, then sheared so
 * the long axis leans. The shear is applied to the sampling coordinate rather
 * than as a CSS transform, so the pixels stay on the grid and crisp.
 */
export const SHAPE = { w: 15, h: 15, creaseW: 2.2, amp: 1.2, period: 1.0, shear: 0.28 };

/**
 * Render the bean as an ASCII map: an array of rows of '#' (lit) and '.' (off).
 *
 * Every consumer works from this map rather than from the maths, which is what
 * keeps the CSS sprite, the favicon and the share card the same bean.
 */
export function buildMap({ w, h, creaseW, amp, period, shear, rotate = 0, rx: rxIn, ry: ryIn }) {
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rx = rxIn ?? w / 2;
  const ry = ryIn ?? h / 2;
  const rows = [];

  const cos = Math.cos(-rotate);
  const sin = Math.sin(-rotate);

  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      /*
       * Rotation is applied to the SAMPLING coordinate, not to the finished
       * sprite. Rotating pixel art with a CSS transform resamples it and the
       * edges go soft; rotating the coordinate re-renders the shape at that
       * angle, so every frame is natively crisp.
       */
      const dx = x - cx;
      const dy = y - cy;
      const rxp = cos * dx + sin * dy + cx;
      const ryp = -sin * dx + cos * dy + cy;

      const sx = rxp - shear * (ryp - cy);
      const inside = (sx - cx) ** 2 / rx ** 2 + (ryp - cy) ** 2 / ry ** 2 <= 1;
      if (!inside) {
        row += '.';
        continue;
      }
      const t = ((ryp - cy) / h) * Math.PI * 2 * period;
      const creaseX = cx + amp * Math.sin(t);
      row += Math.abs(sx - creaseX) < creaseW / 2 ? '.' : '#';
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Collapse an ASCII map into horizontal runs, as `{ x, y, w }` cells.
 *
 * One rect per run rather than one per pixel. The favicon halves in size for
 * free, and the share card's SVG goes from ~150 rects to ~30 -- which matters
 * because librsvg parses it on every generate.
 */
export function mapToRuns(map) {
  const runs = [];
  map.forEach((row, y) => {
    let run = 0;
    [...row].forEach((ch, x) => {
      if (ch === '#') {
        run += 1;
        return;
      }
      if (run) runs.push({ x: x - run, y, w: run });
      run = 0;
    });
    if (run) runs.push({ x: row.length - run, y, w: run });
  });
  return runs;
}
