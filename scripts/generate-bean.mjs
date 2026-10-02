/**
 * The coffee bean mascot, generated.
 *
 * ONE SOURCE OF TRUTH, TWO OUTPUTS. The bean is needed as CSS (box-shadow
 * pixel art, for use anywhere in the page) and as SVG (the favicon, which
 * cannot be a box-shadow). Drawing it twice by hand would guarantee the two
 * drift apart, so both are generated from the single ASCII map below.
 *
 * The geometry itself lives in ./bean-shape.mjs, because the share-card
 * generator needs the same bean. Run `pnpm bean` after editing the map or the
 * parameters, and `pnpm og` too if the bean's silhouette changed. Both outputs
 * are committed -- the build does not run this, so nothing is generated at
 * deploy time and the site has no new build dependency.
 *
 * WHY PIXEL ART. The site's texture language is a 1-bit dither (see DESIGN.md).
 * A smooth vector bean would be the only anti-aliased curve on the site; a
 * pixel bean is made of the same material as everything else. It also costs
 * zero network requests and zero JavaScript.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHAPE, buildMap, mapToRuns } from './bean-shape.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const map = buildMap(SHAPE);
const { w, h } = SHAPE;

/* ---- CSS: one box-shadow per lit pixel -------------------------------- */

/*
 * COLOUR IS `currentColor`, NOT A CUSTOM PROPERTY, AND THAT IS LOAD-BEARING.
 *
 * The obvious version -- `var(--bean-ink)` inside --bean-shadow, with
 * --bean-ink set on .bean -- silently paints nothing. A custom property's
 * var() references are substituted at computed-value time ON THE ELEMENT WHERE
 * IT IS DECLARED. Declared at :root, --bean-ink is undefined there, so
 * --bean-shadow computes to the guaranteed-invalid (empty) value, and it is
 * that empty value which inherits down to the bean. The declaration survives
 * the build perfectly and still renders nothing.
 *
 * `currentColor` sidesteps the whole problem: it is not substituted, it
 * resolves per element against that element's own `color`. So the shadow list
 * inherits intact and colouring a bean is just setting `color` on it -- which
 * also makes the roast animation a plain `color` transition.
 */
const shadows = [];
map.forEach((row, y) => {
  [...row].forEach((ch, x) => {
    if (ch === '#') shadows.push(`${x}px ${y}px 0 currentColor`);
  });
});

/* ---- Roll frames ------------------------------------------------------- */

/*
 * A rotation cycle, rendered as discrete sprite frames.
 *
 * The bean has 180-degree symmetry, so half a turn is a full visual cycle --
 * FRAMES covers 0 to 180 degrees and the sprite reads as a continuous roll at
 * half the frame cost.
 *
 * Rendered on a square canvas slightly larger than the ellipse so the corners
 * do not clip as it turns, and on a smaller grid than the display bean: the
 * roller is only ~24px on screen, and every frame costs its own box-shadow
 * list.
 */
const FRAMES = 8;
const ROLL = { w: 13, h: 13, rx: 5.2, ry: 6.2, creaseW: 2, amp: 1, period: 1, shear: 0 };

const rollFrames = [];
for (let f = 0; f < FRAMES; f++) {
  const angle = (Math.PI * f) / FRAMES;
  const frameMap = buildMap({ ...ROLL, rotate: angle });
  const px = [];
  frameMap.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#') px.push(`${x}px ${y}px 0 currentColor`);
    }),
  );
  rollFrames.push(px);
}

const rollVars = rollFrames
  .map((px, i) => `  --bean-roll-${i}: ${px.join(',')};`)
  .join('\n');

/* ---- Brew apparatus ---------------------------------------------------- */

/*
 * Hand-drawn, unlike the bean. A grinder and a mug are not shapes you solve
 * with an ellipse equation, and an ASCII map is the most editable form there
 * is -- change a character, run `pnpm bean`, see the result.
 *
 * These feed the brew column: bean -> grinder -> dripper -> mug, choreographed
 * by scroll position. See the .brew rules in global.css.
 */
const APPARATUS = {
  grinder: `
..#############..
..#...........#..
...#.........#...
....#########....
....#.......#..##
....#.......#.#..
....#.......#.#..
....#.......#..##
....#.......#....
....#.......#....
....#########....
......#####......
.......###.......`,
  dripper: `
#####################
#...................#
#####################
.#.................#.
..#...............#..
...#.............#...
....#...........#....
.....#.........#.....
......#.......#......
.......#.....#.......
........#...#........
.........###.........
.........#.#.........`,
  mug: `
###############...
#.............#...
#.............#.##
#.............##..#
#.............#...#
#.............#...#
#.............##..#
#.............#.##
.#...........#....
..###########.....`,
  grounds: `
..####..
.######.
########
########`,
};

const apparatusVars = Object.entries(APPARATUS)
  .map(([name, art]) => {
    const rows = art.trim().split('\n');
    const px = [];
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '#') px.push(`${x}px ${y}px 0 currentColor`);
      }),
    );
    const width = Math.max(...rows.map((r) => r.length));
    return [
      `  --sprite-${name}-w: ${width};`,
      `  --sprite-${name}-h: ${rows.length};`,
      `  --sprite-${name}: ${px.join(',')};`,
    ].join('\n');
  })
  .join('\n');

const css = `/**
 * GENERATED BY scripts/generate-bean.mjs -- DO NOT EDIT BY HAND.
 * Run \`pnpm bean\` to regenerate after changing the shape parameters.
 *
 * The bean, as ${shadows.length} box-shadows on a single 1px element. Scaling is done
 * with transform: scale(), which keeps every pixel square at any size --
 * the element itself is always 1x1.
 *
 * Plus ${FRAMES} roll frames on a ${ROLL.w}x${ROLL.h} grid, each a full rotation step. They
 * are swapped with steps(1) rather than interpolated, which is what makes the
 * roll read as sprite animation instead of a morph.
 *
 * The map, for anyone reading this in a diff:
 *
${map.map((r) => ` *   ${r}`).join('\n')}
 */

:root {
  --bean-w: ${w};
  --bean-h: ${h};
  --bean-shadow: ${shadows.join(',')};

  --bean-roll-w: ${ROLL.w};
  --bean-roll-h: ${ROLL.h};
${rollVars}

${apparatusVars}
}
`;

mkdirSync(resolve(ROOT, 'src/styles'), { recursive: true });
writeFileSync(resolve(ROOT, 'src/styles/bean.css'), css);

/* ---- SVG: the favicon -------------------------------------------------- */

/*
 * `currentColor` plus a `prefers-color-scheme` block means the one file works
 * as a favicon in both browser themes without shipping two assets.
 */
// Horizontal runs are merged into single rects, which roughly halves the file.
const rects = mapToRuns(map).map(
  ({ x, y, w: runW }) => `<rect x="${x}" y="${y}" width="${runW}" height="1"/>`,
);

/*
 * Two fills in one file. A favicon is drawn against the browser's own chrome,
 * not against our page, so it follows the OS theme rather than the site theme:
 * umber on a light tab strip, a lighter roast on a dark one. Hard-coded hex
 * because an SVG loaded as an icon gets no page context and therefore no
 * custom properties.
 */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">
<style>
  rect { fill: #6b5334; }
  @media (prefers-color-scheme: dark) { rect { fill: #c2a179; } }
</style>
${rects.join('\n')}
</svg>
`;

writeFileSync(resolve(ROOT, 'public/favicon.svg'), svg);

console.log(
  `bean: ${w}x${h} (${shadows.length}px) + ${FRAMES} roll frames (${rollFrames.reduce((n,f)=>n+f.length,0)}px) + ${Object.keys(APPARATUS).length} apparatus sprites -> src/styles/bean.css; ${rects.length} rects -> public/favicon.svg`,
);
