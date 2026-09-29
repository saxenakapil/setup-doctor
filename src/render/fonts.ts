// Embedded font loading. See docs/themes.md section 5.
//
// Gap tracked in docs/notes.md: real subsetted WOFF2 files for Bricolage
// Grotesque, Figtree and JetBrains Mono are not bundled yet. Until they are
// added under src/data/fonts/ and wired in here, every theme renders with
// its documented fallback stack only (system-ui / monospace) — never a
// network font, so this stays within the no-network hard rule either way.
// Callers don't need special-casing: this returns '' until real font files
// land, at which point it will return @font-face rules with base64 data URIs.
export function embeddedFontFaceCss(): string {
  return '';
}
