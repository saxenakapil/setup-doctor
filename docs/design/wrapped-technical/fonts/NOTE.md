# Font format note

This folder ships the project's own already-bundled JetBrains Mono files (`src/data/fonts/`, SIL OFL 1.1, license text in `LICENSES.md`) in **WOFF2**, not TTF as the rest of this README's file listing describes.

Why: sourcing real `.ttf` files would need either a network fetch (blocked in this environment, and this project never calls out to the network) or a local WOFF2-to-TTF converter (`fonttools`/`woff2_decompress`), neither of which was available. The shipped renderer already embeds these exact WOFF2 files via `embeddedFontFaceCss()` (`src/render/fonts.ts`) and resvg-js renders WOFF2 natively, so the actual golden-image verification in `test/render/` uses these files directly, not a separate TTF set.

`render-reference.py` (optional, for regenerating `landscape.png`/`portrait.png` from the HTML via Playwright) was not run for the same reason and expects real `.ttf` files if you do run it. If exact TTF files are available later, drop them in alongside these and update `landscape.html`/`portrait.html`'s `@font-face` `src` accordingly; nothing else in this folder depends on the container format.
