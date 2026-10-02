/**
 * A 5x7 bitmap typeface, drawn in the same material as the mascot.
 *
 * WHY NOT IBM PLEX. The share card is rasterised by sharp, which renders SVG
 * through librsvg, which resolves `<text>` against *system* fonts. Plex is not
 * installed on a CI runner and probably not on the next machine that runs
 * `pnpm og`, so a `<text>` element would silently fall back to whatever
 * grotesque the host has -- and DESIGN.md's first typographic prohibition is
 * exactly that face. An image that renders differently depending on who
 * generated it is not a design system asset.
 *
 * Embedding Plex properly means shipping a font file and a text-to-path
 * library, i.e. a new dependency and a licence question, to set eleven words.
 *
 * So the card sets its type the way the site draws its mascot: square pixels on
 * a grid, no curves, no anti-aliasing. That is not a workaround dressed up as a
 * decision -- the alternative was a third typeface on a site that permits two,
 * and 1-bit pixel type is already the house material.
 *
 * UPPERCASE ONLY, deliberately. Every string on the card is in the mono/kicker
 * register, which is uppercase anyway, so lowercase glyphs would be forty
 * shapes maintained for nothing. `layoutText` upper-cases its input rather than
 * failing on it.
 */

/* prettier-ignore */
const GLYPHS = {
  ' ': '..... ..... ..... ..... ..... ..... .....',
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .###.',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '##### ..#.. ..#.. ..#.. ..#.. ..#.. #####',
  J: '..### ...#. ...#. ...#. ...#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# ##..# ##..# #.#.# #..## #..## #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# ##.## #...#',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  0: '.###. #...# #..## #.#.# ##..# #...# .###.',
  1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  2: '.###. #...# ....# ...#. ..#.. .#... #####',
  3: '####. ....# ....# .###. ....# ....# ####.',
  4: '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  5: '##### #.... ####. ....# ....# #...# .###.',
  6: '..##. .#... #.... ####. #...# #...# .###.',
  7: '##### ....# ...#. ..#.. .#... .#... .#...',
  8: '.###. #...# #...# .###. #...# #...# .###.',
  9: '.###. #...# #...# .#### ....# ...#. .##..',
  '.': '..... ..... ..... ..... ..... .##.. .##..',
  ',': '..... ..... ..... ..... .##.. .##.. .#...',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '/': '....# ....# ...#. ..#.. .#... #.... #....',
  ':': '..... .##.. .##.. ..... .##.. .##.. .....',
  "'": '..#.. ..#.. ..... ..... ..... ..... .....',
  '!': '..#.. ..#.. ..#.. ..#.. ..#.. ..... ..#..',
  '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
  '&': '.##.. #..#. #..#. .##.. #.#.# #..#. .##.#',
  '+': '..... ..#.. ..#.. ##### ..#.. ..#.. .....',
  '(': '...#. ..#.. .#... .#... .#... ..#.. ...#.',
  ')': '.#... ..#.. ...#. ...#. ...#. ..#.. .#...',
  '·': '..... ..... ..##. ..##. ..... ..... .....',
};

/** Glyph cell, in font units. */
export const GLYPH_W = 5;
export const GLYPH_H = 7;

/**
 * Horizontal advance, in font units: the glyph plus a one-unit sidebearing.
 *
 * Monospaced, because every string on the card is in the register DESIGN.md
 * assigns to mono. It also makes width a multiplication rather than a sum.
 */
export const ADVANCE = GLYPH_W + 1;

/** Width in device pixels of `text` rendered at `scale`. */
export function textWidth(text, scale) {
  const n = [...String(text)].length;
  // The trailing sidebearing is not part of the mark, so it is not measured --
  // otherwise every right-aligned string sits one unit left of where it looks.
  return n === 0 ? 0 : (n * ADVANCE - 1) * scale;
}

/** Height in device pixels of a single line rendered at `scale`. */
export function textHeight(scale) {
  return GLYPH_H * scale;
}

/**
 * Lay a string out as device-pixel rects, ready to be emitted as SVG.
 *
 * Adjacent lit pixels in a row are merged into one rect, which is worth doing:
 * the display line alone is ~400 pixels and ~120 runs.
 *
 * Throws on an unknown character. A silently-dropped glyph would produce a
 * plausible-looking card with a word missing in it, and the whole point of
 * generating this file is that nobody eyeballs it again.
 */
export function layoutText(text, x, y, scale) {
  const chars = [...String(text).toUpperCase()];
  const rects = [];

  chars.forEach((ch, i) => {
    const glyph = GLYPHS[ch];
    if (!glyph) {
      throw new Error(
        `pixel-font: no glyph for ${JSON.stringify(ch)} in ${JSON.stringify(text)}. ` +
          `Add it to GLYPHS in scripts/pixel-font.mjs, or reword the string.`,
      );
    }

    const rows = glyph.split(' ');
    const originX = x + i * ADVANCE * scale;

    rows.forEach((row, ry) => {
      let run = 0;
      const flush = (endX) => {
        if (!run) return;
        rects.push({
          x: originX + (endX - run) * scale,
          y: y + ry * scale,
          w: run * scale,
          h: scale,
        });
        run = 0;
      };

      [...row].forEach((px, rx) => {
        if (px === '#') run += 1;
        else flush(rx);
      });
      flush(row.length);
    });
  });

  return rects;
}
