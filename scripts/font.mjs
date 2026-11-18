// Build only the supported outlines, not a browser-side font parser.
import fs from "node:fs";
import opentype from "opentype.js";
const base = "node_modules/@fontsource/bodoni-moda/";
const fonts = ["latin", "latin-ext"].map((set) =>
  opentype.loadSync(`${base}files/bodoni-moda-${set}-400-normal.woff`),
);
const glyphs = {},
  kern = {};
for (let i = 32; i <= 0x2019; i++) {
  const ch = String.fromCodePoint(i);
  if (!/^\p{Script=Latin}$/u.test(ch) && !" -'’".includes(ch)) continue;
  const f = fonts.find((f) => f.charToGlyphIndex(ch));
  if (!f) continue;
  const g = f.charToGlyph(ch),
    o = [];
  for (const c of g.path.commands) {
    if (c.type === "Z") continue;
    o.push({ M: "m", L: "l", Q: "q", C: "b" }[c.type], c.x, c.y);
    if (c.type === "Q" || c.type === "C") o.push(c.x1, c.y1);
    if (c.type === "C") o.push(c.x2, c.y2);
  }
  glyphs[ch] = { ha: g.advanceWidth, o: o.join(" ") };
}
for (const a of Object.keys(glyphs))
  for (const b of Object.keys(glyphs)) {
    const f = fonts.find((f) => f.charToGlyphIndex(a) && f.charToGlyphIndex(b));
    if (!f) continue;
    const v = f.getKerningValue(f.charToGlyph(a), f.charToGlyph(b));
    if (v) kern[a + b] = v;
  }
fs.mkdirSync("src/assets", { recursive: true });
fs.writeFileSync(
  "src/assets/outlines.json",
  JSON.stringify({
    resolution: fonts[0].unitsPerEm,
    boundingBox: { yMax: fonts[0].ascender, yMin: fonts[0].descender },
    underlineThickness: fonts[0].tables.post.underlineThickness,
    glyphs,
    kern,
  }),
);
fs.copyFileSync(base + "LICENSE", "src/assets/OFL.txt");
