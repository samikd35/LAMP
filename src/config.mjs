import data from "./assets/outlines.json" with { type: "json" };
export const presets = Object.freeze({
  landscape: [1920, 1080],
  square: [1080, 1080],
  portrait: [1080, 1920],
});
const fps = 30;
export const logoFrameCount = 498;
export const logoBackdrop = "#faf9f7";
export const defaults = Object.freeze({
  name: "SAMUEL",
  aspect: "landscape",
  lamp: "#ded7c9",
  text: "#0a0a0c",
  background: "#94a9cf",
  ending: "replace",
  duration: 13,
  frameCount: 390,
  fps,
  seed: 0,
});
export const logoRasterLimit = 1024;
export const logoSvgLimit = 250000;
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
export function analyze(raw) {
  if (typeof raw !== "string") throw Error("Enter a name.");
  const name = raw.trim().normalize("NFC"),
    chars = Array.from(segmenter.segment(name), (g) => g.segment);
  if (!chars.length) throw Error("Enter a name before exporting.");
  if (chars.length > 24)
    throw Error(`Use 24 characters or fewer (currently ${chars.length}).`);
  const eligible = [];
  chars.forEach((ch, i) => {
    const letter = /^\p{Script=Latin}$/u.test(ch) && /^\p{L}$/u.test(ch);
    if ((!letter && !" -'’".includes(ch)) || !Object.hasOwn(data.glyphs, ch))
      throw Error(
        `“${ch}” is not supported by the studio font. Use Latin letters, spaces, hyphens or apostrophes.`,
      );
    if (letter) eligible.push(i);
  });
  if (!eligible.length) throw Error("Include at least one Latin letter.");
  const stems = eligible.filter((i) => /^i$/i.test(chars[i]));
  const auto = (stems.length ? stems : eligible).reduce((a, b) =>
    Math.abs(b - (chars.length - 1) / 2) < Math.abs(a - (chars.length - 1) / 2)
      ? b
      : a,
  );
  return { name, chars, eligible, auto };
}
export function snapshot(input) {
  let logo;
  if (input.logo != null) {
    const { svg, w, h, rgba } = input.logo;
    if (svg !== undefined) {
      if (typeof svg !== "string" || !svg.trim() || svg.length > logoSvgLimit)
        throw Error("Invalid prepared SVG logo.");
      logo = Object.freeze({ svg });
    } else {
      if (
        ![w, h].every((v) => Number.isInteger(v) && v > 0 && v <= logoRasterLimit) ||
        typeof rgba !== "string" ||
        rgba.length !== 4 * Math.ceil((w * h * 4) / 3) ||
        !/^[a-zA-Z0-9+/]+={0,2}$/.test(rgba)
      )
        throw Error("Invalid prepared logo pixels.");
      logo = Object.freeze({ w, h, rgba });
    }
    if (
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.length > 100
    )
      throw Error("Invalid logo label.");
  }
  const { name, auto, eligible } = logo
      ? {
          name: input.name.trim(),
          auto: 0,
          eligible: Array.from({ length: 64 }, (_, i) => i),
        }
      : analyze(input.name),
    target = input.target ?? auto;
  if (!eligible.includes(target)) throw Error("Choose a letter in this name.");
  const aspect = input.aspect ?? defaults.aspect;
  if (!Object.hasOwn(presets, aspect)) throw Error("Unknown output format.");
  const colors = Object.fromEntries(
    ["lamp", "text", "background"].map((k) => {
      const v = input[k] ?? (logo && k === "background" ? logoBackdrop : defaults[k]);
      if (typeof v !== "string" || !/^#[\da-f]{6}$/i.test(v))
        throw Error(`Invalid ${k} color.`);
      return [k, v];
    }),
  );
  const ending = input.ending ?? defaults.ending;
  if (!["replace", "restore"].includes(ending)) throw Error("Unknown ending.");
  const frameCount = logo ? logoFrameCount : defaults.frameCount;
  return Object.freeze({
    ...defaults,
    ...colors,
    name,
    target,
    aspect,
    ending: logo ? "restore" : ending,
    frameCount,
    duration: frameCount / fps,
    ...(logo && { logo }),
  });
}
