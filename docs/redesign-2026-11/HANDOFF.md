# The BOLT: site redesign handoff ("02 Shear v2", Nov 2026)

This is the chosen design for thebolt.stream. Implement it in the existing Astro / Cloudflare site, replacing the current visual design. Keep the existing data plumbing: the now-playing adapters, SongRank and request submission (the established email message format), the contact form backend, and the `/log` route.

## What's in this folder

| Path | What it is |
|---|---|
| `design/shear-v2.reference.dc.html` | The approved mockup as markup with inline styles. **Visual reference only.** It's written for a design-canvas runtime: `{{holes}}`, `<sc-for>`, `<sc-if>`, `<x-dc>`, and a `DCLogic` class. Do not port that runtime; read it for structure, spacing, sizes and copy. Theme colors appear as `{{t.*}}` and map to `design/tokens.json`. |
| `design/tokens.css` | CSS custom properties for light and dark, plus type tokens. Light/dark follows `prefers-color-scheme`, with `data-theme="light|dark"` on `<html>` as a manual override. |
| `design/tokens.json` | The same colors as JSON (`light`/`dark` × `bg, fg, mut, line, sub, field, acc, accText, accInv, accInk, dockBg, dockFg, dockMut, scrim`). |
| `design/brand-sheet.reference.dc.html` | The brand sheet: lockups, color, type, rules. |
| `brand/svg/` | Outlined logo SVGs (no font dependency). Use the `*_currentColor.svg` versions inline on-site so they take the theme color. |
| `brand/png/` | App icons (512/192/180/48/32/16), `favicon.ico`, 1200×630 OG image, 2000w lockup PNGs. |

## Non-negotiables (owner's standing rules)

1. **Light is light, dark is dark.** No large opposite-shade blocks in either mode. That includes the player dock, panels and the log page's now-playing strip. A small filled button is fine.
2. **Red is a spot ink, never the page field.** Brand red `#E10600` for fills, the bolt, live state, the selected rating and the send button. Small red text uses `--bolt-red-text`, which is adjusted per mode to keep 4.5:1.
3. **Logo:** the bolt leans 8° and the wordmark stays upright. Flat, one ink per shape: no gradient, glow, outline or shadow. Header uses `the-bolt_horizontal_currentColor.svg` inline. This replaces the old molten #FF3B1E gradient logo everywhere, including favicon, OG image and app icons.
4. **The site never mentions music rotation categories or patterns.**
5. **The player dock is the network's shared bottom dock**, skinned to the station. It owns the `<audio>` element and persists across navigation (Astro `transition:persist`). It shows **song title first, then artist** ("Crawl Back To My Coffin — Dayseeker"), the same order used everywhere.
6. No skeuomorphism, no serif display type, no Inter.
7. Mobile-first. Desktop and tablet reflow (see Layout).

## Type

All type is Archivo (variable: `wdth` 62–125, `wght` 400–900) plus JetBrains Mono.

| Role | Spec |
|---|---|
| Display / section heads / wordmark text | Archivo `font-stretch: 108%`, 900, `letter-spacing: -0.035em`, uppercase |
| Labels, nav, buttons, artist on hero | Archivo `font-stretch: 62%`, 800, `+0.05em`, uppercase |
| Track titles in lists | Archivo `font-stretch: 87.5%`, 700, 19px, line-height 1.15 |
| Body | Archivo 400 |
| Times, artists in lists, metadata | JetBrains Mono, 10–12px; artists uppercase, `+0.08em` |

Now-playing title: `clamp(38px, 12.4cqi, 116px)`, line-height 0.9. The mockup uses container query units with the page root as `container-type: inline-size`. Use that or the `vw` equivalent.

## Page structure: home (`/`)

1. **Masthead.** Inline logo lockup (bolt + THE BOLT). Nav: Played (#played), Request (#request), and **Contact**, a skewed outlined button that opens the contact modal.
2. **Hero / On air** (most prominent).
   - Red skewed "ON AIR" tag, animated EQ bars and a full-width 2px rule. A **daypart slot** sits on this row, hidden behind a feature flag (`DAYPART_ENABLED=false`) but with its place reserved.
   - Song **title**, then **artist** in red-text condensed caps, then album and year in mono.
   - **Album art** in a parallelogram (`clip-path: polygon(12% 0,100% 0,88% 100%,0 100%)`), full color. The mockup shows a labeled placeholder; real art comes from now-playing metadata.
   - **SongRank:** heading "SongRank" with the subline **"Rate it — tap a slant ↓"** in red text, and the listener's current pick ("You: Like") on the right. Below it are five parallelogram buttons (Hate / Dislike / Neutral / Like / Love), each `transform: skewX(-8deg)` with the label counter-skewed back upright. Each is a real `<button aria-pressed>` with a 2px fg border; the selected one is filled red with `--bolt-on-red` text. Under the buttons sits a slanted listener-split bar (5 segments sized by vote share, Love segment in red). The split data in the mockup is sample data; wire it to real tallies if the backend has them, otherwise hide the bar.
   - **SPINDEX slot:** a dashed "SPINDEX — Track file — liner notes, chart history, listener takes · Reserved" panel, behind `SPINDEX_ENABLED` (default on as a visible placeholder, or off for launch; owner's call). The future SPINDEX API is keyed by title + artist.
3. **Just Played + Request band.** `--bolt-panel` field with a slanted top edge (`clip-path: polygon(0 7cqi,100% 0,100% 100%,0 100%)`).
   - **Just Played** (second priority): last 5 tracks, one row each. **Time** (mono, left) | **title over artist** (title semi-condensed bold, artist small uppercase mono) | **listener SongRank** as 5 small squares (filled = average rank, all red when 5/5) on the right. Then a skewed outlined "Full log →" button.
   - **Request** (third priority): heading, one line of copy, labeled input "Song & artist", and a skewed red "Send it" button. Uses the existing request pipeline.
4. **Footer.** "© 2026 Radiant Ventures · A CLUBFM station", Contact (opens modal), SwagShop (https://swagshop.thebolt.stream), "Stereo · 64k".
5. **Dock.** Sticky bottom: red play button, "THE BOLT · LIVE" mono label with a small bolt, title — artist (ellipsized), and a volume control. 2px fg top rule. Its field is `--bolt-dock-bg`, which is light in light mode.

## Full log (`/log`)

Back link "← Back to on air". Big heading "Just played", one line of intro. A now-playing strip (panel field, 2px fg border, red "Now" + EQ). Today / Yesterday toggle buttons and a search input. Column header row (Time · Track · SongRank) above the same row pattern as home, with 12+ rows and a "Load earlier" button.

## Contact modal

Opens from the masthead and footer. Overlay on `--bolt-scrim`. Dialog: `role="dialog" aria-modal="true"` with focus trap, Esc to close and focus returned to the opener. 2px fg border. Red-text eyebrow "Contact the station", heading "Get in touch.", and a 44px close button. Fields: Topic select (Listener Comments & Questions / Artist / Label Submissions / Advertising / Press & PR / Other / General), Name, Email (side by side ≥ ~430px), Company or artist (optional), Your message, and a red "Send it". Uses the existing contact backend.

## Layout and responsiveness

- Phone (390px) is the primary target; everything stacks.
- At ~900px and up, the hero splits title/meta (left, `flex: 999 1 460px`) and art (right, `flex: 1 1 260px; max-width: 420px`). Just Played (`flex: 3 1 520px`) and Request (`flex: 2 1 320px`) sit side by side. The mockup does this with flex-wrap bases and no media queries. Keep that approach or use breakpoints.
- Max content width is not capped in the mockup. Cap at ~1200px with side gutters if it reads too wide.

## Motion

EQ bars (scaleY loop) and the live pulse. All motion is off under `prefers-reduced-motion: reduce`. Square corners everywhere (`--bolt-radius: 0`), and no hover bounce.

## Accessibility and acceptance

- [ ] All interactive elements are real `<button>`, `<a href>` or `<input>` with labels. Hit targets ≥ 44px.
- [ ] Text contrast ≥ 4.5:1 in both modes. The tokens are pre-checked; don't introduce new grays or reds.
- [ ] Light mode has no dark blocks and dark mode has no light blocks, apart from small buttons.
- [ ] Title before artist in the dock, the log strip and anywhere both appear on one line.
- [ ] The dock survives navigation between `/` and `/log` without interrupting audio.
- [ ] SongRank click, request submit and contact submit go through the existing backend, unchanged.
- [ ] Daypart and SPINDEX slots are behind flags.
- [ ] Favicon, apple-touch-icon (180), manifest icons (192/512) and OG image are replaced with the files in `brand/png`.
- [ ] Lighthouse a11y ≥ 95 on phone, light and dark.
