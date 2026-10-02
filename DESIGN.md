# Design constitution

Rules for anyone — human or agent — making visual decisions on this site.
The companion to [AGENTS.md](./AGENTS.md), which governs everything else.

The organising principle:

> **Two registers, one accent, no soft edges.**

Type is either very large or very small, with almost nothing in between. Colour
is bone and ink, with oxblood used sparingly enough that it still counts. Every
corner is square and every shadow is hard. A design decision that softens any of
those three is working against the system, not refining it.

Less of this is mechanically enforced than in `AGENTS.md`, and the
[enforcement table](#what-is-actually-enforced) says exactly which parts. Treat
the unenforced majority as binding anyway — the whole point of the direction is
that it survives contact with a hundred small decisions.

---

## Why this direction exists

The site belongs to someone who founds an AI company. That makes the default
aesthetic actively expensive: a personal site rendered in Inter, on a blue
accent, with uniformly rounded grey cards, reads in 2026 as something nobody
chose. It undercuts the one thing the site is for.

So the direction is chosen against that baseline, not toward a trend. Where a
generic choice and a deliberate one are otherwise equal, take the deliberate
one. **The tells are specific and they are listed in [Do not use](#do-not-use).**

---

## Palette

Colour lives in `@theme` in `src/styles/global.css`. Components reference
semantic tokens and never literal values, so the dark theme is a token swap
rather than a branch in every component.

Every hue sits in the **warm 25–90 band**. That single constraint is what
carries the identity; it is not a stylistic preference to be relaxed for one
component.

### Light

| Token | Value | Role |
| --- | --- | --- |
| `--color-surface` | `oklch(0.96 0.022 85)` | Cream. The page. |
| `--color-surface-raised` | `oklch(0.92 0.021 85)` | Panel body. Only inside a panel. |
| `--color-chrome` | `oklch(0.25 0.012 65)` | Panel title bars. |
| `--color-chrome-ink` | `oklch(0.96 0.022 85)` | Text on a title bar. |
| `--color-ink` | `oklch(0.19 0.010 65)` | Body text. |
| `--color-ink-muted` | `oklch(0.47 0.012 70)` | Secondary text. Never body copy. |
| `--color-line` | `oklch(0.19 0.010 65)` | Hairlines. Full-strength ink. |
| `--color-rule` | `oklch(0.80 0.016 82)` | Soft rule. Prose only. |
| `--color-accent` | `oklch(0.40 0.075 55)` | Tobacco. Links, marks, emphasis. |
| `--color-accent-hover` | `oklch(0.32 0.070 55)` | |
| `--color-field` | `oklch(0.47 0.055 65)` | Raw umber. Full-bleed fields only. |

**Chroma is low on purpose.** The field sits at `0.055`, not the `0.15` a
terracotta would want. That restraint is what lets the dither read as paper
texture rather than as a block of colour, and it is the difference between
"earthy" and "orange". Raising the chroma is the most likely way to lose the
character of this palette while believing you are strengthening it.

**Hairlines are ink, not grey.** A 1px full-contrast rule is the single most
characteristic mark in the system. Lightening borders to be polite is the fastest
way to turn this back into a generic site.

### Dark

The dark theme is a **warm** near-black — `oklch(0.19 0.009 70)` — never a
blue-tinted charcoal. Accent lightens to `oklch(0.72 0.075 62)` to hold contrast
against it, and `--color-line` inverts to cream.

`--color-field` is the exception that does not simply invert. Ink text sits *on*
the field in both themes, so it has to stay light enough to carry dark type —
but the umber that works against cream is glaring against a near-black page. It
loses chroma and gains lightness instead: `oklch(0.52 0.05 65)`.

### Choosing a theme

Both themes are reachable, and which one a visitor gets is decided in this
order:

1. An explicit choice, stored in `localStorage` and applied to `<html>` as
   `data-theme` **before first paint** by the bootstrap in `BaseLayout.astro`.
2. Otherwise `prefers-color-scheme`.

The toggle needs JavaScript and is honest about it: it ships `hidden` and the
bootstrap reveals it. Without JS the system preference still works — there is
simply no override, so no dead control is offered. A CSS-only toggle was not an
option: CSS cannot remember a choice across a navigation, so it would reset on
every click-through.

Because the two cases cannot be written as one selector, the dark palette is
**duplicated** in `global.css` — once under the media query, once under
`[data-theme='dark']`. Keep the two lists identical.

### Using the accent

One accent, used with restraint, is the discipline. Oxblood is for links, the
focus ring, a selected state, and the occasional marked phrase. It is **not** a
section background, not a button fill on every button, and not a way to make
something feel important that isn't.

`--color-field` is separate and rarer still: one, at most two full-bleed dithered
bands per page, and only on pages in the display register.

## Typography

Two families from one superfamily, loaded through the Astro Fonts API and
self-hosted. See the note in `AGENTS.md` on why a web font is justified here.

- **IBM Plex Sans** — everything readable. Weights 400 and 600 only.
- **IBM Plex Mono** — labels, metadata, dates, figures, panel titles, code.

Mono is not decoration. It marks **machine-adjacent information**: a timestamp, a
version string, a measurement, a filename. If the text is prose, it is sans.

### The scale

| Token | Size | Leading | Use |
| --- | --- | --- | --- |
| `--text-display` | `7.5rem` | `0.82` | The `<h1>` on display-register pages. |
| `--text-title` | `2.25rem` | `1.05` | Section headings in the display register. |
| `--text-heading` | `1.5rem` | `1.3` | `h2` in prose. |
| `--text-body` | `1rem` | `1.6` | Body copy. |
| `--text-small` | `0.875rem` | `1.5` | Secondary text. |
| `--text-kicker` | `0.6875rem` | `1.2` | Mono, uppercase, `0.08em` tracking. |
| `--text-micro` | `0.625rem` | `1.1` | Mono. Panel title bars only. |

**Leading below 1 on the display size is the move, not a bug.** At `7.5rem` with
`0.82` leading the lines nearly collide, and that near-collision is most of what
makes the register read as designed rather than merely large. Do not relax it to
something comfortable.

Display type scales with `clamp(3rem, 12vw, 7.5rem)` so it stays enormous
relative to the viewport rather than merely large on desktop and broken on a
phone.

Tracking tightens as size grows: `-0.03em` at display, `-0.01em` at title,
normal at body, `+0.08em` on kickers.

## Space and measure

Base unit **4px**. Every margin, padding and gap is a multiple of it:
`4 8 12 16 24 32 48 64 96 128`. Nothing in between; if a value needs to be 30px,
the layout is wrong, not the scale.

- `--container-content` — `38rem`. The reading column.
- `--container-wide` — `72rem`. Indexes and panel fields.
- `--spacing-gutter` — `1.5rem`.

Separate content in this order, and **stop as soon as it reads**: whitespace
first, then a hairline, then — rarely — a panel. A background-tinted box is the
last resort and usually the wrong one.

## The panel

The window primitive, in `src/components/ui/Panel.astro`. It is the signature
component and the only place `--color-surface-raised` appears.

```
┌────────────────────────────────┐
│ BRYCEDECORA.COM v0.1           │  ← title bar: chrome bg, mono micro, 2px 6px
├────────────────────────────────┤
│                                │
│  body: surface-raised, 1rem    │
│                                │
└────────────────────────────────┘
   1px solid ink · radius 0 · shadow 3px 3px 0 ink
```

- Border `1px solid var(--color-line)`. Radius `0`. Always.
- Optional hard offset shadow `3px 3px 0 var(--color-ink)`. Never a blur.
- Title bars are mono, `--text-micro`, and read like shipped software:
  `BRYCEDECORA.COM v0.1`, `PROJECTS`, `CATALOGUE`. Version numbers are
  encouraged. They are ornament, and they are allowed to be funny.

**Semantics come first.** A panel with a heading renders `<section>`; a purely
ornamental one renders `<div>`. This is the `AGENTS.md` rule that a `<section>`
must have an accessible heading, and the panel does not get an exemption.

### Overlap

Panels may overlap, at different sizes, off the grid. That deliberate disorder is
the point of the display register.

It is a **visual treatment applied above `64rem` only**, layered over a stack
that is already correct in source order. Below that breakpoint panels stack
plainly. DOM order always matches reading order — the overlap never reorders
content, and a screen reader never encounters the chaos.

## Texture

**Dithering, never gradients.** Texture comes from a 1-bit halftone pattern: an
8×8 inline SVG `background-image` data URI with `image-rendering: pixelated`,
tiling infinitely, tinted through `currentColor`. Zero requests, roughly 200
bytes, and it is the strongest single anti-default signal in the system.

Anywhere the instinct says "gradient", the answer is the dither.

Other permitted marks, all pure CSS:

- **Crop marks** — corner registration ticks around a display block.
- **Leader lines** — dotted rules connecting a label to its value, as in a
  table of contents.
- **Rotated mono** — a vertical string running up a wide margin. Ornament only,
  and `aria-hidden`.

## Layout registers

Pages are in exactly one of two registers. There is no third.

**Display** — `/` and `/projects/`. Mono kicker with a leader, display `<h1>`
a full-bleed dithered field of overlapping panels, a numbers
band, lists with leaders. Loud, dense, playful.

**Reading** — articles, `/about/`, everything else. The reading measure, normal
heading sizes, generous leading. It inherits only the quiet parts of the
language: kickers, ink hairlines, mono metadata, square code blocks.

The split is deliberate: be fun where the page is selling, and get out of the way
where someone is actually reading.

### Numbers, not adjectives

Where a page makes a claim, lead with a number. `0 KB of JavaScript. 100/100
SEO.` beats any sentence containing the word "blazing".

`AGENTS.md` forbids fabricated metrics and that applies with full force here.
Every number on a page must be **read from real build output** — `.seo/manifest.json`,
the Lighthouse report — never typed as a literal that silently becomes false on
the first regression. A claim gets a `(Proof)` link or it does not get made.

## The mascot

A coffee bean, drawn as 1-bit pixel art. It is the one figurative mark on the
site, and it is made of the same material as everything else — square pixels on
a grid, no curves, no anti-aliasing.

It is generated. `scripts/generate-bean.mjs` builds an ASCII map from a handful
of shape parameters and emits **both** outputs from it: the box-shadow pixel
list (`src/styles/bean.css`) and the favicon (`public/favicon.svg`). Run
`pnpm bean` after changing the shape. Never hand-edit either output — drawing
the bean twice is how the favicon and the page stop matching.

### Where it appears

- **The brew column** — the site's showpiece. In an article it is sticky in the
  left rail and follows the reader down; on the homepage it is a fixture beside
  the writing list, running the whole cycle on a slow loop. Same component,
  same keyframes.
- **The watermark** — an enormous bean inside the rust field, cropped by the
  band's edges and parallaxing inside it.
- The favicon, the 404 (where it turns on its own), the footer colophon, and
  the mark on a section rule.

### The brew column

Reading progress, told as a pour-over, choreographed by how far down the page
you are. **Two acts, and only the apparatus each act needs is on screen** — the
dripper is the through-line and never leaves.

```
ACT ONE — GRIND              (no cup: nothing has been brewed yet)
  0–20%    the bean falls into the grinder, rotating as it goes
  22–50%   grounds gather in the dripper
  42–52%   the grinder leaves

ACT TWO — BREW               (no grinder: the grinding is done)
  46–56%   the cup arrives
  52–88%   drips fall
  52–90%   the cup fills

ACT THREE — REST             (no dripper: the brewing is done)
  86–94%   the dripper leaves
  90–100%  the full cup steams
```

The drips and the fill overlap deliberately: the level rises *with* them rather
than on its own schedule. The water has to arrive from somewhere.

**Two modes, one set of keyframes.** Every stage boundary lives inside the
keyframes as a percentage of the whole cycle, never in `animation-range`. That
is what lets the same choreography be driven by scroll position in an article
and by a duration on the homepage, with nothing restated — the mode only
decides where the timeline comes from.

The fast sub-loops (drips falling, steam rising, the bean tumbling) are timed
in *both* modes. A drip should fall at a drip's rate; it is not a function of
how fast someone scrolls. Their wrappers window them to the right act.

The column's footprint never changes. Elements fade rather than collapse,
because a sticky element that reflows mid-scroll jitters under the reader.

The cup's fill is a `scale`, not an animated `height`. Height is a layout
property, and the homepage loop runs forever.

It replaced a bean that rolled across the top of the viewport on every page.
That version worked, and it was the wrong idea: something moving through your
peripheral vision while you are reading a paragraph is a cost, not a feature.
This sits still in the margin and rewards a glance.

`steps(1)` on the bean's rotation is load-bearing. Without it the browser
interpolates between two box-shadow lists of different lengths and the bean
smears instead of turning.

**Desktop only, and it renders nothing where scroll timelines are
unsupported.** A phone has no spare column, and a half-brewed cup frozen
forever is worse than no cup.

Rules for using it:

- `<Bean />` is **always decorative** and always `aria-hidden`. If a bean ever
  needs to carry meaning, label it at the call site.
- Four sizes: `sm` 15px, `md` 30px, `lg` 90px, `xl` 150px. The element painting
  it is always 1×1 and scaled by transform, so pixels stay square at any size.
- It is painted in `currentColor`. Tint it by setting `color`, never by
  reintroducing an ink variable — see the note in the generator for why that
  silently paints nothing.
- Placement is sparing. A bean in every corner stops being a signature.
- Anything the bean overlaps must clip it. `.field` sets `overflow: hidden` for
  exactly this reason: the watermark is wider than a phone, and uncropped it
  widens the document and scrolls the whole page sideways.

## The share cards

For most people a share card is the first thing they see of this site, and for
many it is the only thing. It gets the same treatment as a page.

Every card is a panel: mono title bar, ink hairline, hard offset shadow, and a
full-bleed dithered field at its foot. There are two, and **they split along
the same two registers the site does**:

| | `public/og/default.png` | `public/og/writing/<slug>.png` |
| --- | --- | --- |
| Used by | every non-article page | one per published article |
| Display type | the name, at a fixed 15× | the article's `<h1>`, auto-fitted to 12× or less |
| The bean | 90px, in the band | 90px, in the band |
| Band reads | what the site is about | the byline |

The default card is selling, so the name is enormous and the mascot is loud.
An article card is carrying someone else's sentence, so the title takes the
display slot and the bean drops to a quiet stamp. Same components, different
volume — exactly the split in [Layout registers](#layout-registers).

### The square safe zone, and the one centred layout on the site

**A share card is not always shown at 1.91:1.** A link in a Facebook comment, a
WhatsApp reply or an iMessage bubble is previewed as a square thumbnail, and
the platform gets that square by centre-cropping the card to `630×630` — taking
`x 285..915` and throwing away a third of the image from each side.

So **every card's type is centred on the card's vertical axis and set inside
that square.** Anything that has to be *read* sits within `285..915`; everything
else may run outside it.

The distinction is what a thing crops to:

| Crops to | Treatment |
| --- | --- |
| a fragment of itself | panel, title bar, field band, hairlines, the bean — may run full width |
| a fragment of a **word** | the display name, article titles, the kicker — centred, inside the square |

The name used to be flush left at `x=88`, which is 197px outside the window, so
the one thing the card exists to say arrived as "YCE / CORA". Nothing else about
the card was wrong — at full width it read perfectly, which is exactly why it
survived. **This class of failure is invisible unless you look at the crop.**

#### This is a deliberate exception to "no centred-everything"

[Do not use](#do-not-use) forbids centred layouts, and that rule still holds
everywhere it was written for: pages. It does not survive contact with a card
that gets cropped from both sides at once. Left-aligned type cannot be rescued
by any choice of scale — `x=88` is outside the window at *every* size, and
making the type smaller only moves it further out. Centring is the only
position that is stable under a symmetric crop.

The asymmetry is kept where it still works: dotted leaders flank the kicker and
run out to the panel's insets, which is what makes the centring read as
composed rather than as a default. **This exception is scoped to the share
cards. It is not licence to centre a page.**

Three consequences are load-bearing and will look like mistakes otherwise:

- **The display scale is 15, not 16.** "DeCora" is the longest line and sets the
  ceiling. At 16 it leaves 35px of air inside the crop, which assumes every
  platform crops exactly centred; at 15 it leaves 52px a side and survives a
  crop that is a few percent off. One scale step is not a visible loss. A name
  with its first letter shaved off is.
- **Article titles wrap at 534px, not the full 1000px measure**, and the scale
  list runs down to 5. A 534px measure is barely half the panel, so titles wrap
  to more lines and settle smaller than the old full-width setting chose — the
  longest lands at 5 rather than 10 or 12. That is the trade: a quieter title on
  the large unfurl, against a title that is readable rather than sliced
  everywhere else.
- **The mascot is a 90px stamp in the band on *both* cards.** Once the type is
  centred there is no body margin for it to fill — the space falls on both
  sides of the name, and a bean in one of them un-centres what was just
  centred. The default card's "loud" 270px mascot is gone, and the two
  registers now part on the display type alone: a name at a fixed 15, against a
  title auto-fitted to 12 or less. The alternative was stacking the bean above
  the name inside a 360px body, which forced the name down to 13 and left 5px
  of air top and bottom.

`scripts/og-card.mjs` **throws** if any of that type crosses the boundary,
rather than relying on anyone remembering this section. The check is in the
generator rather than a test because only the generator knows where a string
was placed, and because the crop is rendered on someone else's server, where
nothing we run would ever see it.

**The band line is not held to the rule.** It is the one piece of type still set
flush left, and a square crop does cut it. At the size these thumbnails are
actually shown — 100–150px in every context that crops to a square — type below
the display scale is not legible at all, so arranging it for the crop would be
positioning pixels nobody can resolve. The default card's line is 735px at its
own scale and would not fit the square at any rate.

They are **generated** — `scripts/og-card.mjs` draws them, `pnpm og` writes
them, output committed. Same contract as the bean: the build never runs it, so
the deploy gains no dependency. Do not edit the PNGs.

Four things about them are decisions rather than details:

- **An article card is titled from the page's real `<h1>`**, read out of
  `.seo/manifest.json`, never re-parsed from frontmatter. And
  `tests/seo/og-cards.spec.ts` re-renders every card on every run and compares
  it to the committed file, so a title edit without a `pnpm og` fails the
  build. That test is the entire reason these can be committed binaries — the
  failure it prevents is a card showing a title the article no longer has,
  which nothing else on the site would ever notice.

- **The palette is read, not retyped.** The generator parses the light `@theme`
  block out of `global.css` and converts OKLCH to sRGB itself. A card whose
  cream has drifted from the site's cream is a defect nobody would ever catch
  by looking.
- **The type is a 5×7 bitmap face** (`scripts/pixel-font.mjs`), not IBM Plex.
  The rasteriser resolves `<text>` against system fonts, so Plex would silently
  become whatever grotesque the generating machine had — the exact face
  [Do not use](#do-not-use) names first. Pixel type is already the house
  material: it is what the mascot and the favicon are made of. This is **not** a
  third typeface, and it is not licensed to appear on a page.
- **The dither cell is 24px, three times the 8px cell on the page.** Every
  platform renders an unfurl at roughly a third of full width, and an 8px cell
  resamples into flat grey noise at that size. 24px arrives on screen as the
  8px cell it is imitating.

The bean on a card is whole, not cropped — the one place the watermark pattern
does not apply. The bean's identity is its outline, and a card has no field
deep enough to crop one and still leave a bean. Two attempts confirmed it.

**Article titles set themselves.** The scale is chosen per title, largest that
fits, down to 6×; a title that will not fit at all throws rather than
overflowing. Titles are written for the page and vary in length by a factor of
two, so a fixed size would leave one timid and another running off the edge.
The block is centred between the kicker and the band, which is what makes a
two-line card and a four-line card read as one design.

Leading is **two font units on a title, one on the name**. The display rule is
0.82 and a bitmap face cannot take that literally — its glyph box has no
internal leading, so at one unit a sentence's lines visibly fused. A name is
two words and stays tight; a sentence has to survive being read off a
thumbnail.

**No numbers on them, ever.** A committed PNG cannot be re-derived from build
output, so any figure baked into one becomes a fabricated metric the moment it
changes, with no test watching. The only figures on any card are the default's
own dimensions and a joke version number.

## Motion

Motion is nearly absent, and what exists costs no JavaScript.

- Hover and focus transitions on `color` and `border-color` only, `≤120ms`,
  linear. No easing theatrics, no transforms.
- **Scroll-driven animation only** — `animation-timeline: view()`. Panels settle
  as they arrive, and the bean roasts from raw to
  dark as it crosses the viewport. These run on the compositor and are tied to
  scroll position, not to a clock, so nothing ever animates on its own.
- Every scroll-driven rule sits inside `@supports (animation-timeline: view())`.
  Without the guard an unsupporting browser would run them as ordinary timed
  animations and fire all of them at once on load — worse than no motion. The
  guard makes the fallback a plain static page.
- No timed entrance animations. Content is present when the page is.
- `prefers-reduced-motion` is honoured globally in `global.css`, and the
  scroll-driven block is additionally wrapped in `no-preference`. View
  transitions are disabled separately, because they are their own animation
  tree and the global clamp does not reach them.

## Navigation

Cross-document view transitions are on (`@view-transition { navigation: auto }`).
Two lines of CSS, no router, no framework, no JavaScript — and the usual
argument for making this an SPA disappears with them. Browsers without support
navigate normally.

## Accessibility

The relevant rules live in `AGENTS.md` and are not restated here, but two
interact with this direction specifically:

- **Contrast.** Hairline-ink and bone-ink both clear AA comfortably. Oxblood on
  bone clears AA for body text. `--color-ink-muted` is for secondary text only —
  putting body copy in it fails, and Lighthouse will say so.
- **Focus.** The `:focus-visible` ring is the one permitted radius in the entire
  system (`2px`), because a square ring reads as a rendering artefact. It is a
  floor, not a suggestion to remove.

## The chat widget

The CloseBot widget is part of the design system, not an exception to it. It
ships as a `#3B82F6` header with 12px corners and a blurred drop shadow — every
single thing this file bans, sitting permanently in the corner of every page.

`src/styles/closebot-widget.css` restyles it: the header becomes a panel title
bar, corners go square, the shadow goes hard, and the palette comes from the
same tokens as everything else, so light and dark need no widget-specific work.

Two things to know before editing it:

- It is the **only** place `!important` is allowed. The widget injects its own
  `!important` stylesheet at runtime and sets `background` inline, so nothing
  weaker wins. That licence does not extend past this file.
- It is coupled to someone else's class names. If the widget is redesigned, the
  overrides fail quietly and it reverts to blue-and-rounded. The durable fix is
  real theming support in `cb.js`.

---

## Do not use

The load-bearing section. Silence here is where an agent falls back to defaults,
so the constraints are stated as prohibitions with their reasons.

**Colour**

- No gradients, anywhere, of any kind. Texture is the dither pattern.
- No purple, pink, or blue as a brand colour. Hue stays in the warm 25–90 band.
  (The one permitted blue is `#0000EE` if raw-HTML link honesty is ever wanted
  deliberately — never as a brand accent.)
- No glassmorphism, blur backdrops, or translucent overlays.
- No tinted grey box around a card to separate it from the page.

**Form**

- No `border-radius` other than `0`. The sole exception is the `2px` focus ring.
- No soft or multi-layer shadows. Hard offset only, or none.
- No uniform `16px` radius plus `24px` padding on everything. Hierarchy comes
  from deliberate variation, not from one comfortable value applied everywhere.

**Type**

- No Inter, Geist, Roboto, Open Sans, or bare `system-ui` as a display face.
  They are the default, and the default is the thing being avoided.
- No third typeface. Two, from one superfamily.
- No comfortable mid-sized headings in the display register. That middle ground
  is exactly what the two-register rule exists to remove.

**Layout**

- No full-width hero → icon-grid features → testimonial carousel. That page
  shape is the single most recognisable generated-site structure there is.
- No centred-everything. Asymmetry and a strong left edge are the default. The
  single exception is the share cards, which are cropped from both sides by
  platforms and so cannot use a left edge at all — see
  [The square safe zone](#the-square-safe-zone-and-the-one-centred-layout-on-the-site).
  That exception does not extend to a page.
- No decorative `<section>` without a heading. Use a `<div>`.

**Imagery**

- No stock photography. No abstract 3D blobs. No AI illustration.
- Real screenshots, real diagrams, real marks, or nothing.

**Copy**

- No adjective-led headlines. Lead with a number or a noun.
- No hedging: "may help", "can potentially", "designed to".
- No "all-in-one", "seamless", "cutting-edge", "build the future",
  "supercharge", "unlock", "revolutionise".
- Write in the first person, in a voice a specific human would use out loud.

---

## What is actually enforced

A rule nobody checks is a suggestion. Most of this file is _(judgement)_, and
saying so plainly is more useful than pretending otherwise.

| Rule | Enforced by |
| --- | --- |
| Colour contrast meets AA | Lighthouse CI — accessibility ≥ 0.95 |
| Visible focus indicator on every control | Lighthouse CI + `:focus-visible` in `global.css` |
| `prefers-reduced-motion` honoured | `global.css` base layer |
| Web-font cost stays inside budget | Lighthouse CI — performance ≥ 0.9 |
| Script budget for ornament islands | `tests/seo/javascript.spec.ts` |
| Display register does not break heading rules | `tests/seo/headings.spec.ts` |
| Panels with headings use real landmarks | `tests/seo/headings.spec.ts` |
| No fabricated numbers in a claim | `tests/seo/structured-data.spec.ts` |
| Every image has `alt` and dimensions | `tests/seo/images.spec.ts` |
| Share cards match what the generator draws | `tests/seo/og-cards.spec.ts` |
| Every article has its own share card | `tests/seo/og-cards.spec.ts` |
| Default card reads when cropped to square | `scripts/og-card.mjs` throws — `pnpm og` fails |
| Ornament does not occupy a phone screen | `tests/e2e/mobile.spec.ts` |

Everything else — the palette hues, the two registers, the leading below 1, the
square corners, every entry under **Do not use** — is judgement, and needs a
human or an agent that read this file.

---

## Changing this file

The direction is meant to be held, not iterated on weekly. But it is not
sacred, and two kinds of change are healthy:

1. **Extending it.** A new component needs a rule; add the rule.
2. **Replacing a value with a better one in the same spirit.** A warmer bone, a
   better oxblood, a tighter scale.

What is not healthy is softening it one exception at a time — a rounded corner
here, a gentler border there, a gradient "just for this one hero". That is how a
site with a point of view becomes a site without one, and no single commit in
that sequence ever looks like the problem.
