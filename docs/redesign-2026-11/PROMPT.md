Paste this into Claude Code from the root of the thebolt.stream repo, after copying this folder to `docs/redesign-2026-11/`.

---

Implement the new thebolt.stream design described in `docs/redesign-2026-11/HANDOFF.md`.

Context:
- The design reference is `docs/redesign-2026-11/design/shear-v2.reference.dc.html`. It's a mockup written for a design-canvas runtime (`{{holes}}`, `<sc-for>`, `<sc-if>`, `DCLogic`). Use it as a visual and structural reference only; don't port that runtime. Theme colors in it (`{{t.*}}`) map to `design/tokens.json` / `design/tokens.css`.
- Brand assets are in `docs/redesign-2026-11/brand/`. The new logo replaces the old molten gradient logo everywhere.
- Keep all existing data plumbing (now-playing adapters, SongRank and request submission, contact form backend, `/log`). This is a visual and structural rebuild, not a backend change.

How to work:
1. Read HANDOFF.md, the reference file and this repo's CLAUDE.md. Then show me a plan before writing code: which components and files change, how tokens get wired in, and how the dock persists across navigation. List anything in the handoff that conflicts with what's in the repo.
2. After I approve, build it in small commits: tokens and fonts → masthead + logo → hero + SongRank → Just Played + Request band → dock → `/log` → contact modal → icons/OG/manifest → feature flags (DAYPART_ENABLED, SPINDEX_ENABLED).
3. Run the dev server and check the home page and `/log` at 390px and 1280px in both light and dark mode. Go through the HANDOFF acceptance checklist and report each item as pass or fail.
4. Don't change backend endpoints, message formats or env secrets. Don't deploy.
