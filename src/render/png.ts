// PNG export via the optional @resvg/resvg-js dependency. Guarded dynamic
// import: if the package isn't installed, callers get null and fall back
// to "SVG written, PNG needs the optional package" (docs/scope.md section
// 17). The import specifier is a variable, not a string literal, so
// TypeScript does not try to resolve types for a package this repo never
// requires to be present.

const RESVG_SPECIFIER = '@resvg/resvg-js';

export async function renderSvgToPng(svg: string, widthPx: number): Promise<Buffer | null> {
  try {
    const mod = (await import(RESVG_SPECIFIER)) as {
      Resvg: new (svg: string, opts: unknown) => { render(): { asPng(): Uint8Array } };
    };
    const resvg = new mod.Resvg(svg, { fitTo: { mode: 'width', value: widthPx } });
    const png = resvg.render().asPng();
    return Buffer.from(png);
  } catch {
    return null;
  }
}
