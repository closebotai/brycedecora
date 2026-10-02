/**
 * The share card, as a pure function: spec in, SVG out.
 *
 * Separated from generate-og.mjs so the test suite can render a card without
 * writing one. `tests/seo/og-cards.spec.ts` imports this module, renders what
 * each card *should* look like from the current build, and compares it against
 * the committed PNG -- which is the whole reason the cards can be generated
 * artefacts without silently going stale when an article title changes.
 *
 * Nothing here touches the filesystem except reading global.css for the
 * palette, and nothing here writes.
 *
 * See "The share card" in DESIGN.md for the decisions this file implements.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import { SHAPE, buildMap, mapToRuns } from './bean-shape.mjs';
import { layoutText, textWidth, textHeight, ADVANCE } from './pixel-font.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ---- Palette: read, not retyped ---------------------------------------- */

/**
 * Pull the light-theme tokens straight out of global.css.
 *
 * Hard-coding six hex values here would work exactly once. The tokens are the
 * single source of truth for colour (DESIGN.md, "Palette"), and a share card
 * whose cream drifts from the site's cream is worse than no share card,
 * because nobody would ever notice.
 *
 * Only the light theme. An OG image cannot respond to `prefers-color-scheme`,
 * and cream-and-ink is the site's primary identity, so the card commits to it.
 */
function readTokens() {
  const css = readFileSync(resolve(ROOT, 'src/styles/global.css'), 'utf8');

  // The dark palette is duplicated further down the file, once under the media
  // query and once under [data-theme]. Cut before the first of them so a token
  // lookup cannot pick up a dark value.
  const darkAt = css.indexOf('prefers-color-scheme: dark');
  const light = darkAt === -1 ? css : css.slice(0, darkAt);

  return (name) => {
    const match = light.match(
      new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
    );
    if (!match) {
      throw new Error(
        `og-card: --color-${name} not found in the light @theme block of ` +
          `src/styles/global.css. If the token was renamed, rename it here too.`,
      );
    }
    return oklchToHex(Number(match[1]), Number(match[2]), Number(match[3]));
  };
}

/**
 * OKLCH to sRGB hex.
 *
 * The tokens are authored in OKLCH and librsvg only speaks sRGB, so the
 * conversion has to happen somewhere. Doing it here rather than pasting hex
 * into this file is what lets the palette above be *read* instead of copied.
 *
 * Björn Ottosson's published matrices, unmodified.
 */
function oklchToHex(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  const hex = linear
    .map((v) => {
      // Gamma-encode, then clamp. Clamping after encoding rather than before
      // keeps in-gamut channels exact; all of our tokens are well inside sRGB.
      const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
      const byte = Math.round(Math.min(1, Math.max(0, encoded)) * 255);
      return byte.toString(16).padStart(2, '0');
    })
    .join('');

  return `#${hex}`;
}

const token = readTokens();
const COLOR = {
  surface: token('surface'),
  surfaceRaised: token('surface-raised'),
  chrome: token('chrome'),
  chromeInk: token('chrome-ink'),
  ink: token('ink'),
  accent: token('accent'),
  field: token('field'),
  fieldInk: token('field-ink'),
};

/* ---- Geometry ----------------------------------------------------------- */

/*
 * The 4px unit from DESIGN.md, scaled up. The card is ~2.5x a panel as it
 * appears on the page, so hairlines, padding and the drop shadow are all
 * multiplied to match -- a literal 1px border would disappear the moment Slack
 * renders this at a third of its size.
 */
export const CARD_W = 1200;
export const CARD_H = 630;

const PANEL = { x: 40, y: 40, w: 1100, h: 534 };
const SHADOW = 16; // the panel's hard offset shadow; 3px on the page
const BORDER = 4; // the ink hairline; 1px on the page
const PAD = 48; // content inset inside the panel

const TITLEBAR_H = 64;
const BAND_H = 110; // the full-bleed field at the foot of the panel

const BODY_Y = PANEL.y + TITLEBAR_H;
const BAND_Y = PANEL.y + PANEL.h - BAND_H;
const INNER_X = PANEL.x + BORDER;
const INNER_RIGHT = PANEL.x + PANEL.w - BORDER;
const TEXT_X = PANEL.x + PAD;

/** Widest a line of body text may be before it has to wrap. */
const MEASURE = INNER_RIGHT - PAD - TEXT_X;

/* ---- The square safe zone ----------------------------------------------- */

/*
 * THE CENTRE SQUARE, AND WHY THE DEFAULT CARD IS COMPOSED INSIDE IT.
 *
 * A 1.91:1 card is what the large unfurl wants, and it is what we emit. But a
 * link posted in a Facebook comment, a WhatsApp reply, or an iMessage bubble is
 * previewed as a SQUARE THUMBNAIL, and the platform gets that square by centre-
 * cropping this image to 630x630 -- taking x 285..915 and discarding a third of
 * the card from each side.
 *
 * The card used to set the name flush left at x=88, which is 197px outside that
 * window. So the one thing the card exists to say arrived as "YCE / CORA".
 * Nothing else was wrong with it: at full width it read perfectly, which is
 * exactly why it survived -- the failure is invisible unless you look at the
 * crop.
 *
 * So the rule is: ANYTHING THAT MUST BE READ GOES INSIDE THE SAFE ZONE.
 * Everything else -- the panel, the title bar, the field band, the mascot --
 * may run outside it, because those crop to a fragment of themselves rather
 * than to a fragment of a word. A sliced title bar still reads as a title bar.
 *
 * Only the display name is held to this. The kicker and the band line are set
 * inside it too where they fit, but at the size a square thumbnail is actually
 * displayed -- 100-150px wide in every one of those contexts -- type below the
 * display scale is not legible at all, so optimising it for the crop would be
 * arranging pixels nobody can resolve.
 */
const SAFE_W = CARD_H; // a 1:1 crop takes the full height, so the square is H x H
const SAFE_X = Math.round((CARD_W - SAFE_W) / 2);
/*
 * Air between the type and the edge of the crop.
 *
 * Not cosmetic: it is the tolerance for platforms that do not crop exactly
 * centred. Type that merely *fits* the square is one rounding difference away
 * from touching the edge, so the bound below is the padded box, not the square.
 */
const SAFE_PAD = 48;
/** Widest a line may be and still clear the crop on both sides. */
const SAFE_MEASURE = SAFE_W - SAFE_PAD * 2;

/**
 * Throws if a string set at `x` would be clipped by the square crop.
 *
 * The check is here rather than in a test because this file is the only thing
 * that knows where a string was placed, and because the failure it catches is
 * one nobody would see: the full card looks right, and the crop is only ever
 * rendered by someone else's server.
 */
function assertInSafeZone(label, x, width) {
  /*
   * Checked against the PADDED box. Centring made the unpadded check almost
   * useless: a centred line only breaches the raw square once it is wider than
   * the whole 630px of it, so the name could grow to fill the crop edge to edge
   * and still pass. The padding is the tolerance, so the padding is the bound.
   */
  const left = SAFE_X + SAFE_PAD;
  const right = SAFE_X + SAFE_W - SAFE_PAD;
  if (x >= left && x + width <= right) return;
  throw new Error(
    `og-card: ${label} spans ${x}..${x + width}, outside the square safe zone ` +
      `${left}..${right} (a ${SAFE_W}px centre crop, less ${SAFE_PAD}px of air). ` +
      `It would be cut in a Facebook comment or a WhatsApp preview. Shorten it, ` +
      `or set it at a smaller scale.`,
  );
}

/*
 * The display scale is 15, not the 16 it was.
 *
 * "DeCora" is the longest line and sets the ceiling: at 16 it is 560px wide and
 * leaves 35px of air inside a 630px crop, which assumes every platform crops
 * exactly centred. At 15 it is 525px and leaves 52px a side, which survives a
 * crop that is a few percent off. One scale step is not a visible loss; a name
 * with its first letter shaved off is.
 */
const SCALE = { titleBar: 4, kicker: 3, display: 15, field: 3 };

/* ---- Drawing primitives ------------------------------------------------- */

/**
 * A card under construction. Every draw call pushes an SVG node.
 *
 * Rects rather than a canvas because the output has to be an SVG string for
 * sharp to rasterise, and because every mark on the card is an axis-aligned
 * rectangle -- there is not a curve in the design.
 */
function newCard() {
  return { parts: [] };
}

const rect = (card, x, y, w, h, fill, extra = '') =>
  card.parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`);

/** Pixel type, emitted as one path per string. */
const text = (card, str, x, y, scale, fill) => {
  const d = layoutText(str, x, y, scale)
    .map((r) => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`)
    .join('');
  card.parts.push(`<path d="${d}" fill="${fill}"/>`);
};

/** The bean, at `scale` device pixels per map pixel. */
const bean = (card, x, y, scale, fill, extra = '') => {
  const d = mapToRuns(buildMap(SHAPE))
    .map(({ x: bx, y: by, w }) => {
      const px = x + bx * scale;
      const py = y + by * scale;
      const pw = w * scale;
      return `M${px} ${py}h${pw}v${scale}h-${pw}z`;
    })
    .join('');
  card.parts.push(`<path d="${d}" fill="${fill}"${extra}/>`);
};

/** Bean footprint in device pixels at a given scale. Square, by construction. */
const beanSize = (scale) => SHAPE.w * scale;

/**
 * A dotted leader, as in a table of contents (DESIGN.md, "Texture").
 *
 * Not only ornament: it ties the left-hand text block to whatever sits on the
 * right across the gap the display block opens up, so the empty middle reads
 * as space rather than as an unfinished layout.
 */
const leader = (card, from, to, y, scale, fill) => {
  for (let x = from; x + scale <= to; x += scale * 3) {
    rect(card, x, y, scale, scale, fill);
  }
};

/**
 * The same rule laid out from its RIGHT end, for the flank left of a centred
 * label.
 *
 * `leader` starts at `from` and stops wherever the last whole dot fits, which
 * leaves a ragged end. On the left flank that ragged end would land against
 * the label -- the one place it is conspicuous -- and the two flanks would
 * visibly fail to mirror each other.
 */
const leaderBack = (card, from, to, y, scale, fill) => {
  for (let x = to - scale; x >= from; x -= scale * 3) {
    rect(card, x, y, scale, scale, fill);
  }
};

/** Left edge that centres a string of `width` on the card's vertical axis. */
const CENTER_X = Math.round(CARD_W / 2);
const centerX = (width) => CENTER_X - Math.round(width / 2);

/* ---- Shared chrome ------------------------------------------------------ */

/**
 * Everything every card has: the page, the hard shadow, the panel, the title
 * bar, and the dithered field at the foot.
 *
 * The caller fills the body between `BODY_Y` and `BAND_Y` and supplies the
 * band's own line of text.
 */
function drawShell(card, { titleBarLeft, titleBarRight, bandText }) {
  // The page behind the window.
  rect(card, 0, 0, CARD_W, CARD_H, COLOR.surface);

  // Hard offset shadow. Never a blur -- DESIGN.md, "The panel".
  rect(card, PANEL.x + SHADOW, PANEL.y + SHADOW, PANEL.w, PANEL.h, COLOR.ink);

  // Panel body, then the title bar over its top edge.
  rect(card, PANEL.x, PANEL.y, PANEL.w, PANEL.h, COLOR.surfaceRaised);
  rect(card, PANEL.x, PANEL.y, PANEL.w, TITLEBAR_H, COLOR.chrome);

  const barY = PANEL.y + (TITLEBAR_H - textHeight(SCALE.titleBar)) / 2;
  text(card, titleBarLeft, INNER_X + 16, barY, SCALE.titleBar, COLOR.chromeInk);
  if (titleBarRight) {
    text(
      card,
      titleBarRight,
      INNER_RIGHT - 16 - textWidth(titleBarRight, SCALE.titleBar),
      barY,
      SCALE.titleBar,
      COLOR.chromeInk,
    );
  }

  /* ---- The field band -------------------------------------------------- */

  const band = { x: INNER_X, y: BAND_Y, w: INNER_RIGHT - INNER_X, h: BAND_H };

  card.parts.push(
    `<clipPath id="band"><rect x="${band.x}" y="${band.y}" width="${band.w}" height="${band.h}"/></clipPath>`,
    `<g clip-path="url(#band)">`,
  );

  rect(card, band.x, band.y, band.w, band.h, COLOR.field);

  /*
   * The dither. The field's only texture -- there is no gradient anywhere in
   * this file, which is DESIGN.md's first colour prohibition.
   *
   * The cell is 24px, three times the 8px cell in global.css. At 1:1 that is
   * wrong; at the size anyone actually sees this it is right. Slack, LinkedIn
   * and X all render an unfurl around a third of full width, and an 8px cell
   * with 1px dots resamples into flat grey noise at that scale. 24px survives
   * the downscale as the 8px cell it is imitating.
   */
  const DITHER_CELL = 24;
  const DITHER_DOT = 3;
  // The same eight positions as --dither-cell, on its 8x8 grid.
  const points = [
    [0, 0],
    [4, 0],
    [2, 2],
    [6, 2],
    [0, 4],
    [4, 4],
    [2, 6],
    [6, 6],
  ];

  const cells = points
    .map(([dx, dy]) => {
      const x = (dx / 8) * DITHER_CELL;
      const y = (dy / 8) * DITHER_CELL;
      return `M${x} ${y}h${DITHER_DOT}v${DITHER_DOT}h-${DITHER_DOT}z`;
    })
    .join('');

  card.parts.push(
    `<pattern id="dither" width="${DITHER_CELL}" height="${DITHER_CELL}" patternUnits="userSpaceOnUse">`,
    `<path d="${cells}" fill="${COLOR.fieldInk}" fill-opacity="0.3"/>`,
    `</pattern>`,
  );
  rect(card, band.x, band.y, band.w, band.h, 'url(#dither)');

  text(
    card,
    bandText,
    TEXT_X,
    band.y + (band.h - textHeight(SCALE.field)) / 2,
    SCALE.field,
    COLOR.fieldInk,
  );

  return { band, closeShell: () => card.parts.push('</g>') };
}

/** Hairlines last, so nothing paints over them. */
function drawHairlines(card, band) {
  rect(card, band.x, band.y - BORDER, band.w, BORDER, COLOR.ink);
  card.parts.push(
    `<rect x="${PANEL.x + BORDER / 2}" y="${PANEL.y + BORDER / 2}" ` +
      `width="${PANEL.w - BORDER}" height="${PANEL.h - BORDER}" ` +
      `fill="none" stroke="${COLOR.ink}" stroke-width="${BORDER}"/>`,
  );
}

function toSvg(card) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" shape-rendering="crispEdges">
${card.parts.join('\n')}
</svg>
`;
}

/* ---- Text fitting ------------------------------------------------------- */

/**
 * Greedy word wrap at a given scale. Returns null if any single word is too
 * wide to fit on a line of its own -- the caller then tries a smaller scale.
 */
function wrap(words, scale, maxWidth) {
  const lines = [];
  let line = '';

  for (const word of words) {
    if (textWidth(word, scale) > maxWidth) return null;
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, scale) <= maxWidth) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);

  return lines;
}

/**
 * Pick the largest scale at which `str` fits the given box.
 *
 * Article titles are written for the page, not for this card, so their length
 * varies by a factor of two. Choosing the scale per title is what keeps a
 * short title from looking timid and a long one from overflowing -- and it
 * means a new article never needs anyone to revisit this file.
 *
 * Throws rather than overflowing. A card with its title running off the edge
 * would ship, because nobody re-opens a generated PNG.
 */
function fitText(str, { maxWidth, maxHeight, scales, lineStep }) {
  const words = String(str).split(/\s+/).filter(Boolean);

  for (const scale of scales) {
    const lines = wrap(words, scale, maxWidth);
    if (!lines) continue;

    const step = lineStep(scale);
    const height = (lines.length - 1) * step + textHeight(scale);
    if (height <= maxHeight) return { lines, scale, step };
  }

  throw new Error(
    `og-card: cannot fit ${JSON.stringify(str)} in ${maxWidth}x${maxHeight} at any ` +
      `scale down to ${scales[scales.length - 1]}. Shorten the title, or add a smaller scale.`,
  );
}

/*
 * Leading, in font units, where the glyph box is 7.
 *
 * DESIGN.md sets display leading at 0.82, which is below 1 on purpose. A
 * bitmap face cannot take that literally: its glyph box has no internal
 * leading, so 0.82 would overlap the ink of one line into the next and the
 * type would become unreadable rather than tight.
 *
 * TWO VALUES, because the two cards are setting different things. A name is
 * two words and one unit of gap makes it a block, which is the near-collision
 * the display rule is after. An article title is a sentence that has to be
 * *read* off a thumbnail, and at one unit its lines visibly fused. Two units
 * is still tighter than any default and it stays legible at unfurl size.
 */
const nameStep = (scale) => 8 * scale;
const titleStep = (scale) => 9 * scale;

/* ---- The cards ---------------------------------------------------------- */

/*
 * Every string below also appears on the site: the title bar is the domain,
 * the kicker is the homepage's `kicker` prop, the display line is its
 * `heading`, and the field line compresses its meta description. The card is
 * the hero, not a second piece of positioning written for social.
 *
 * NO NUMBERS. A committed PNG cannot be re-derived from build output, so any
 * figure baked into one becomes a fabricated metric the moment it changes,
 * with no test watching -- see AGENTS.md. The only figures on these cards are
 * the default's own dimensions and a joke version number.
 */

/** The fallback card: the homepage hero, as a window. */
export function renderDefaultCard() {
  const card = newCard();
  const { band, closeShell } = drawShell(card, {
    titleBarLeft: 'brycedecora.com v0.1',
    titleBarRight: '1200x630',
    bandText: 'AI systems that handle sales conversations',
  });

  /*
   * THE MASCOT MOVED TO THE BAND.
   *
   * It used to sit in the body at 270px, filling the space a left-weighted
   * display block opened up. Once the type is centred there is no such space:
   * the margins fall on BOTH sides of the name, and a bean in one of them
   * un-centres the thing we just centred.
   *
   * So it drops to the band, whole, at the same 90px stamp the article card
   * uses. That costs the two cards a point of difference -- DESIGN.md had the
   * default's mascot "loud" and the article's quiet -- and the registers now
   * part on the display type alone: a name set at a fixed 15, against a title
   * auto-fitted to 12 or smaller. The alternative was stacking the bean above
   * the name inside a 360px body, which forced the name down to scale 13 and
   * left 5px of air top and bottom. Cramped, to keep a mascot in a thumbnail
   * where the name is the only thing anyone reads.
   *
   * Drawn before closeShell() so the band's clip path contains it.
   */
  const beanScale = 6;
  const beanPx = beanSize(beanScale);
  bean(
    card,
    band.x + band.w - PAD - beanPx,
    band.y + (band.h - beanPx) / 2,
    beanScale,
    COLOR.fieldInk,
  );
  closeShell();

  const kickerY = BODY_Y + 44;
  const kicker = 'Co-founder / CloseBot';
  const kickerW = textWidth(kicker, SCALE.kicker);
  const kickerX = centerX(kickerW);
  text(card, kicker, kickerX, kickerY, SCALE.kicker, COLOR.accent);
  assertInSafeZone('the kicker', kickerX, kickerW);

  /*
   * Leaders on BOTH flanks now, running out to the panel's insets.
   *
   * A centred label with a rule on one side only reads as a left-aligned line
   * that drifted. Two symmetric flanks are what make the centring deliberate,
   * and they are the one element wide enough to hold the full width of the
   * card -- without them the body is three short lines marooned in the middle
   * of 1048px of cream.
   */
  const leaderY = kickerY + textHeight(SCALE.kicker) - SCALE.kicker;
  leaderBack(card, TEXT_X, kickerX - 24, leaderY, SCALE.kicker, COLOR.accent);
  leader(card, kickerX + kickerW + 24, INNER_RIGHT - PAD, leaderY, SCALE.kicker, COLOR.accent);

  const displayY = kickerY + textHeight(SCALE.kicker) + 36;
  ['Bryce', 'DeCora'].forEach((line, i) => {
    const width = textWidth(line, SCALE.display);
    const x = centerX(width);
    text(card, line, x, displayY + i * nameStep(SCALE.display), SCALE.display, COLOR.ink);
    assertInSafeZone(`the display line ${JSON.stringify(line)}`, x, width);
  });

  drawHairlines(card, band);
  return toSvg(card);
}

/**
 * An article's card. The title is the hero; the name moves to the band.
 *
 * This is the same two-register split the site itself uses (DESIGN.md,
 * "Layout registers"): on the default card the name is the display type and
 * the mascot is enormous, because the card is selling. Here the article's
 * title takes the display slot and the bean drops to a quiet mark in the
 * band, because the thing being shared is the writing.
 *
 * `title` is the page's real `<h1>`, read out of the build manifest by
 * generate-og.mjs -- not re-derived from frontmatter. The card and the page
 * cannot disagree about what the article is called.
 */
export function renderArticleCard({ title }) {
  const card = newCard();
  const { band, closeShell } = drawShell(card, {
    titleBarLeft: 'brycedecora.com/writing/',
    titleBarRight: '',
    bandText: 'Bryce DeCora · Co-founder, CloseBot',
  });

  // A quiet bean, whole, at the band's right edge. One mascot per card --
  // "a bean in every corner stops being a signature".
  const beanScale = 6;
  const beanPx = beanSize(beanScale);
  bean(
    card,
    band.x + band.w - PAD - beanPx,
    band.y + (band.h - beanPx) / 2,
    beanScale,
    COLOR.fieldInk,
  );
  closeShell();

  const kickerY = BODY_Y + 44;
  const kicker = 'Writing';
  const kickerW = textWidth(kicker, SCALE.kicker);
  const kickerX = centerX(kickerW);
  text(card, kicker, kickerX, kickerY, SCALE.kicker, COLOR.accent);

  const leaderY = kickerY + textHeight(SCALE.kicker) - SCALE.kicker;
  leaderBack(card, TEXT_X, kickerX - 24, leaderY, SCALE.kicker, COLOR.accent);
  leader(card, kickerX + kickerW + 24, INNER_RIGHT - PAD, leaderY, SCALE.kicker, COLOR.accent);

  const regionY = kickerY + textHeight(SCALE.kicker) + 36;
  const regionH = BAND_Y - regionY - 24;

  /*
   * ARTICLE TITLES WRAP AT THE SQUARE, NOT AT THE PANEL.
   *
   * Same reason as the default card: a line set across the full 1000px measure
   * loses its first and last few characters to a centre crop, and a title is
   * the one thing on the card that has to be read.
   *
   * The cost is real and worth stating. A 534px measure is barely half the
   * panel, so titles wrap to more lines and settle at a smaller scale than the
   * old full-width setting chose -- the longest of them lands at 5 rather than
   * the 10 or 12 it used to. The scales list is extended down to 5 for exactly
   * that reason; without it, a long title throws instead of setting.
   *
   * That is the trade: a slightly quieter title on the large unfurl, against a
   * title that is readable rather than sliced everywhere else.
   */
  const fit = fitText(title, {
    maxWidth: SAFE_MEASURE,
    maxHeight: regionH,
    // Never as large as the name on the default card: a title is a sentence,
    // and a sentence at 16x would wrap to six lines of two words.
    scales: [12, 11, 10, 9, 8, 7, 6, 5],
    lineStep: titleStep,
  });

  /*
   * Centred in the space between the kicker and the band, not hung from its
   * top. Titles differ in length by a factor of two, so a fixed top edge
   * leaves a short one marooned with a band of dead space beneath it. Centring
   * is what makes a two-line card and a four-line card look like the same
   * design rather than two attempts at one.
   */
  const blockH = (fit.lines.length - 1) * fit.step + textHeight(fit.scale);
  const displayY = regionY + Math.round((regionH - blockH) / 2);

  fit.lines.forEach((line, i) => {
    const width = textWidth(line, fit.scale);
    const x = centerX(width);
    text(card, line, x, displayY + i * fit.step, fit.scale, COLOR.ink);
    assertInSafeZone(`the title line ${JSON.stringify(line)}`, x, width);
  });

  drawHairlines(card, band);
  return toSvg(card);
}

/* ---- Rasterisation ------------------------------------------------------ */

/**
 * SVG string to PNG buffer.
 *
 * Indexed PNG: a card is a couple of dozen flat colours with no gradients and
 * no curves, so a palette costs nothing visually and roughly quarters the
 * file. A share image is fetched by a crawler on a timeout; small is a feature.
 */
export async function rasterise(svg) {
  return sharp(Buffer.from(svg)).png({ palette: true, effort: 10 }).toBuffer();
}

/**
 * Decode an image to raw RGB pixels, for comparing two cards.
 *
 * The test compares PIXELS, not encoded bytes. PNG encoding is a function of
 * the libvips build, so byte equality would turn a routine `sharp` upgrade
 * into a suite-wide failure that says nothing about the design. Every mark on
 * a card is an axis-aligned rect under `shape-rendering: crispEdges`, so the
 * rasterised pixels are stable in a way the compressed bytes are not.
 */
export async function toPixels(input) {
  return sharp(input).removeAlpha().raw().toBuffer();
}

export { COLOR, ADVANCE };
