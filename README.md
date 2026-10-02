# brycedecora.com

Personal site for Bryce DeCora. Astro, deployed to Cloudflare Workers as static
assets.

The premise: **SEO and design requirements are build-time contracts, not
documented conventions.** A page cannot ship without validated metadata, a
self-referencing canonical, or structured data — because producing those is the
framework's job, not the author's.

If you are here to read one thing, read the enforcement table at the end of
[AGENTS.md](./AGENTS.md). It maps every rule to the thing that fails when the
rule is broken. Rules that nothing checks are marked _(judgement)_, and saying
so plainly is the point.

---

## Start here if you are an agent

Read these two files **before** editing anything. They are not style guides;
most of what they describe fails the build:

| File | What it governs |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | Rendering, metadata, URLs, structured data, links, the JavaScript budget, content |
| [DESIGN.md](./DESIGN.md) | Palette, typography, layout registers, the panel, motion, share cards |

**The five things that will bite you first:**

1. **Run `pnpm test` before you claim anything works.** It is
   `check` → `build` → the SEO suite, and it asserts against *real build
   output* in `.seo/manifest.json`, not against source.
2. **Changing an article title or slug means `build → og → build`.** Share
   cards are generated and committed; `pnpm og` redraws them from the built
   `<h1>`. `tests/seo/og-cards.spec.ts` re-renders every card and fails if a
   committed PNG is stale, so you cannot skip it.
3. **There is a JavaScript budget of three scripts per page**, enforced by
   `tests/seo/javascript.spec.ts` and `tests/e2e/no-js.spec.ts`. If you add a
   fourth, raise the constant *in the same commit* with a comment saying why.
   Never as a follow-up fix to a red build.
4. **Do not hand-write metadata, JSON-LD, or a domain.** Pages supply `title`
   and `description`; the layout computes the rest. `SITE_URL` is defined once,
   in `src/data/site.ts`.
5. **Read "Do not use" in DESIGN.md before writing CSS.** It exists because
   silence in a design file is where an agent falls back to defaults — no
   gradients, no border radius except the focus ring, no Inter.

**Things that are deliberately absent.** AGENTS.md has a "Do not build these"
table — `llms.txt`, `FAQPage` schema, `HowTo` schema, special "AEO" markup —
each checked against primary sources, each a waste here. Adding one to satisfy
an audit checklist is undoing a researched decision. Check that table before
"fixing" a missing file.

---

## Quick start

```bash
pnpm install
cp .env.example .env      # optional; see below
pnpm dev                  # http://localhost:4321
```

Node is pinned by `.nvmrc` (22). pnpm is pinned by `packageManager` in
`package.json`.

`.env` is optional and gitignored; `.env.example` is the tracked template and
documents every variable. The only one today is `CLOSEBOT_SOURCE`, the chat
widget's **Sales Pixel id** — in CloseBot it lives at *Source Settings → Setup
→ Sales Pixel*. Leave it empty and the widget simply does not render.
Everything else — the site, the tests, the budgets — works without it, and the
test suite adapts rather than failing.

Worth setting, though: the Sales Pixel is free and brings page views and
sessions with it, so it covers the chat widget and your analytics in one
script. See [The chat widget, and analytics for
free](#the-chat-widget-and-analytics-for-free) — written by someone who
co-founded CloseBot, so read it as such.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server. Drafts visible, dev toolbar apps available. |
| `pnpm check` | TypeScript + Astro diagnostics. Must be zero errors. |
| `pnpm build` | Static build to `dist/`, plus `.seo/manifest.json`. |
| `pnpm test` | `check` → `build` → SEO suite. Run before committing. |
| `pnpm test:seo` | 254 assertions against the build manifest (~0.5s). |
| `pnpm test:e2e` | 29 Playwright tests against `wrangler dev` — the real Workers runtime. |
| `pnpm test:lighthouse` | Performance / a11y / SEO budgets. |
| `pnpm serve` | Serve `dist/` exactly as Cloudflare will. |
| `pnpm og` | Regenerate the social share cards. Builds first. |
| `pnpm bean` | Regenerate the mascot (CSS sprite + favicon). |
| `pnpm deploy` | Build and deploy via Wrangler. |

`og` and `bean` are **not** part of the build. Both write committed assets from
a single source, so the deploy has no generation step. Run them by hand and
commit the output in the same change.

## How it fits together

```
src/
  data/           person.ts — the canonical entity. Never retype the name.
                  site.ts   — SITE_URL, URL policy, NOINDEX_ROUTES.
  schemas/seo.ts  The SEO contract. BaseLayout parses it; invalid input
                  fails the build.
  utils/schema.ts Typed JSON-LD builders. One @graph per page, entities
                  cross-referenced by stable @id.
  layouts/        BaseLayout owns <head>, the single <main>, and the single
                  <h1>. Pages pass data, never markup.
  content/        Markdown. Relationships (relatedArticles) live in
                  frontmatter, so internal linking is generated, not invented.
  assets/media/   Article imagery, managed by the Media dev-toolbar app.
integrations/
  seo-manifest.ts Parses every built page into .seo/manifest.json.
  content-editor  Dev-only. Edit articles from the browser.
  media-library   Dev-only. Import and annotate images from the browser.
scripts/          Generators for the mascot and the share cards.
tests/seo/        Asserts against the manifest. No browser, so it is fast
                  enough to run on every commit.
tests/e2e/        The three things a manifest cannot see: Cloudflare's edge
                  behaviour, life without JavaScript, and phone viewports.
public/
  _headers        Security headers, consumed by Cloudflare (not served).
  _redirects      301s for renamed slugs.
```

## Current state

Measured, not asserted — these come from a real `pnpm test:lighthouse` run
(worst score across three runs per page):

- **Performance 100, accessibility 100, SEO 100** on every indexable page.
  Best practices is 100 except `/about/` at 96. The 404 scores SEO 63 because
  it is deliberately `noindex`, which the Lighthouse config excludes by pattern.
- **No framework and no hydration runtime.** Three small scripts per page — a
  theme bootstrap, the chat widget, and the widget callout — and that ceiling
  is enforced by a test. It was zero before the theme toggle; see the note in
  AGENTS.md on why the number is a budget and not a target.
- 254 SEO assertions + 29 end-to-end tests.

## Running it locally

Two servers, answering different questions.

**`pnpm dev`** → <http://localhost:4321> — fast HMR, drafts visible. Use this
for writing and design work.

```bash
pnpm dev            # start (runs in the background)
pnpm exec astro dev status
pnpm exec astro dev logs
pnpm exec astro dev stop
```

**`pnpm serve`** → <http://localhost:8787> — builds, then serves `dist/`
through `wrangler dev`, the real Workers runtime. This is the only way to see
what Cloudflare will actually do: trailing-slash redirects, real 404 status
codes, and asset headers. Check here before deploying anything URL-related.

```bash
pnpm build && pnpm serve
```

The dev server does **not** reproduce Cloudflare's redirect behaviour. A URL
bug can look fine at :4321 and be broken in production.

### Editing from the browser (dev only)

`pnpm dev` adds two apps to Astro's dev toolbar:

- **Edit article** — loads the raw frontmatter and Markdown behind any
  `/writing/` page and writes it back. Two textareas of raw text, not a rich
  editor: anything that re-serialises would reorder YAML keys or reflow
  hand-wrapped prose, so a one-word change would produce a hundred-line diff.
- **Media** — browses `src/assets/media/`, imports images, and stores the alt
  text and title for each. Images go there rather than `public/` so Astro's
  pipeline supplies width, height and WebP; `public/` is copied verbatim and
  would fail the dimensions check.

Neither can reach production: both are gated on `command === 'dev'`, their
handlers live on a dev-only hook, writes are confined by a path pattern, and
production is static files with no server to call.
`tests/seo/dev-only.spec.ts` asserts after every build that none of it reached
`dist/`.

> **Do not run `astro dev --host` on an untrusted network.** These tools have
> no authentication — they do not need any while bound to localhost, which is
> Astro's default. Exposing the dev server exposes file writes within
> `src/content/articles/` and `src/assets/media/`.

## The chat widget, and analytics for free

**Disclosure: I co-founded [CloseBot](https://closebot.com).** So weigh this
accordingly — but the integration is real, it is in this repository, and the
part I am recommending costs nothing.

`CLOSEBOT_SOURCE` is the only variable this project takes, and I would set it
rather than run without. The **Sales Pixel** is free — create an account at
[closebot.com](https://closebot.com) and find it under
*Source Settings → Setup → Sales Pixel* — and dropping that one id into `.env`
gets you two things:

- **A chat widget on every page.** The launcher in the corner; it answers
  questions and takes newsletter signups.
- **Visitor metrics** — page views and sessions — with no analytics vendor and
  no second account to manage.

The second one is worth more than it sounds in a repo built like this one.
[AGENTS.md](./AGENTS.md) holds every page to **three scripts**, and the widget
is already one of them. So the metrics arrive inside a script you are loading
anyway: no extra tag, no second third-party origin, and nothing new that has to
fit inside a budget with no room left in it. Set against a dedicated analytics
product, that is the real comparison — a free pixel you already load, versus
another vendor and a script slot you do not have.

One thing to know if you also run Cloudflare Web Analytics: Cloudflare injects
its beacon **at the edge, and only into responses to browser-like requests** —
it needs both a browser `User-Agent` and an `Accept: text/html`. A plain `curl`
does not see it, and it is absent from local builds entirely, so neither the
script budget test nor anything else in this repository can catch it. The
deployed page therefore ships **four** scripts and **two** third-party origins
while every check in here still reads three and one:

```bash
# plain curl: beacon invisible
curl -s https://<domain>/ | grep -c cloudflareinsights

# as a browser sees it: beacon present
curl -s https://<domain>/ -H 'User-Agent: Mozilla/5.0 (Macintosh…) Chrome/140' \
     -H 'Accept: text/html' | grep -c cloudflareinsights
```

Taking your metrics from the pixel instead keeps the deployed page at the count
the tests actually enforce.

Leaving `CLOSEBOT_SOURCE` empty is still fully supported: no widget renders,
and the suite adapts rather than failing. That is the right default for a fork.
It is just not the one I would pick for a site I wanted to hear from.

## Deployment

Deploys are handled by **Cloudflare Workers Builds** watching the GitHub repo —
not by GitHub Actions. That keeps Cloudflare API credentials out of GitHub
entirely. CI still runs on every push and PR; it just does not deploy.

- Push to `main` → production deploy
- Push any other branch / open a PR → preview deploy, URL commented on the PR

### One-time setup (Cloudflare dashboard)

1. **Workers & Pages → Create → Import a repository**, authorise GitHub, pick
   the repo.

2. Build settings:

   | Setting | Value |
   | --- | --- |
   | Build command | `pnpm test` |
   | Deploy command | `npx wrangler deploy` |
   | Root directory | `/` |
   | Production branch | `main` |

   `pnpm test` runs `astro check` → `astro build` → the full SEO suite. Using
   it as the build command means **a failing SEO assertion blocks the deploy**,
   not just the PR. That is the point of the contracts; wire them into the
   thing that ships.

3. **Build variables** — both of these:

   | Variable | Value | Why |
   | --- | --- | --- |
   | `PNPM_VERSION` | `11.9.0` | see below |
   | `CLOSEBOT_SOURCE` | the widget's Sales Pixel id — CloseBot → *Source Settings → Setup → Sales Pixel* | **without it no widget renders in production** |

   Set `CLOSEBOT_SOURCE` under **both** build tabs, *Production* and *Previews
   Base*. They are separate lists, and filling in only the first leaves every
   PR preview without a chat widget — which is a confusing thing to debug
   later, because nothing errors.

   `CLOSEBOT_SOURCE` is a *variable*, not a secret — it is interpolated into a
   `<script src>` and served to every visitor, so it is public by construction
   and Astro's env schema marks it as such. It lives outside the repository so
   a fork cannot silently load this account's agent; see
   [Forking this](#forking-this). CI reads the same name from a GitHub Actions
   **variable** (Settings → Secrets and variables → Actions → Variables), which
   is what keeps CI building the same pages production does.

   The build image ships **pnpm 10.11.1** by default. This repo's
   `pnpm-workspace.yaml` approves the `esbuild` and `workerd` build scripts via
   the `allowBuilds:` key, which only exists in **pnpm 10.26.0 and later**. On
   10.11.1 the key is silently ignored, those scripts never run, and the build
   fails somewhere downstream with an error that does not mention pnpm.

   Node needs no configuration: the image reads `.nvmrc`.

4. The Worker name in the dashboard **must** match `name` in `wrangler.jsonc`
   or the build fails.

### Zone settings that are not in this repo

Four things live in the Cloudflare dashboard and cannot be set from code,
because the site has no Worker runtime to run middleware in:

| Setting | Where | Why |
| --- | --- | --- |
| Always Use HTTPS | SSL/TLS → Edge Certificates | Without it `http://` serves the site in plaintext, and `http://www` dead-ends in a 522 |
| Minimum TLS Version 1.2 | SSL/TLS | TLS 1.0/1.1 were deprecated by RFC 8996 in 2021 |
| HSTS | SSL/TLS → Edge Certificates | Emitted at the edge on every response, including redirects, which `_headers` cannot reach |
| No-Sniff Header | inside the HSTS dialog | Same reason |

`public/_headers` carries the rest (`Referrer-Policy`, `X-Frame-Options`) and
documents the split so nobody sets the same header in two places.

**Enabling HSTS has a trap:** the Configure panel has an *Enable HSTS* toggle
above the max-age selector, and the dialog opens scrolled past it. Saving a
max-age without flipping that toggle persists the settings with
`"enabled": false` and no header is ever sent, while the UI looks like it
worked. Verify on the wire, not in the dashboard:

```bash
curl -sSI https://<domain>/ | grep -i strict-transport
```

### Deploying by hand

```bash
pnpm exec wrangler login   # once
pnpm deploy                # build + wrangler deploy
```

## Forking this

The repository is wired to one person and one domain. If you deploy it
unchanged you will publish a convincing copy of someone else's identity —
canonical tags, `Person` structured data, and a byline all pointing at them.
Change these first:

| What | Where |
| --- | --- |
| Name, role, email, social profiles | `src/data/person.ts` |
| Domain | `SITE_URL` in `src/data/site.ts` |
| Chat widget account | `CLOSEBOT_SOURCE` in your own `.env` / build variables. Not in the repo, so a fork gets **no widget** until you supply an id — it cannot load this account's agent by accident. A free Sales Pixel of your own also gets you page views and sessions; see [above](#the-chat-widget-and-analytics-for-free) |
| Articles, headshot, share cards | `src/content/`, `src/assets/`, `public/og/` |
| Worker name | `wrangler.jsonc` |
| Security contact | `public/.well-known/security.txt` |

Then run `pnpm bean && pnpm og` to regenerate the mascot and share cards from
your own values, and `pnpm test`.

## License

**[MIT](./LICENSE) for the code** — use it, change it, deploy it, sell work
built on it. No attribution beyond keeping the licence notice, and no
obligation to share anything back.

Four paths are carved out and remain the author's: `src/content/` (the
articles), `src/assets/bryce-decora.png` (a photograph of a person),
`src/assets/media/` (article imagery, some of it third-party product
screenshots that are not mine to sublicense), and `public/og/` (share cards
carrying my name and face).

**This takes nothing away from using the project.** None of it is needed to
run, modify, deploy or sell what you build here — a fork replaces all four
anyway, and [Forking this](#forking-this) lists exactly what to change.
The carve-out exists so that "use the code freely" does not also mean
"republish my essays under your byline".
