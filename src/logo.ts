import * as T from "three";
import { contours } from "d3-contour";

export type Logo = { w: number; h: number; rgba: string };
const color = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (a: string, b: string, k: number) =>
  color(rgb(a).map((v, i) => v * (1 - k) + rgb(b)[i] * k));
function contrast(a: string, b: string) {
  const lum = (h: string) =>
    rgb(h).reduce(
      (sum, v, i) =>
        sum +
        [0.2126, 0.7152, 0.0722][i] *
          (v <= 10 ? v / 3294.6 : ((v / 255 + 0.055) / 1.055) ** 2.4),
      0,
    );
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export async function importLogo(file: File) {
  if (file.size > 2 * 1024 * 1024)
    throw Error("Choose an SVG or PNG smaller than 2 MB.");
  let blob: Blob = file;
  if (/\.svg$/i.test(file.name)) {
    const source = await file.text();
    if (
      source.length > 250000 ||
      /<!doctype|<!entity|<\?xml-stylesheet/i.test(source)
    )
      throw Error("Please supply a simple outlined SVG.");
    const doc = new DOMParser().parseFromString(source, "image/svg+xml"),
      root = doc.documentElement;
    if (
      root.localName !== "svg" ||
      root.namespaceURI !== "http://www.w3.org/2000/svg" ||
      doc.querySelector("parsererror")
    )
      throw Error("Invalid SVG document.");
    const tags = new Set(
      "svg g path rect circle ellipse polygon polyline title desc".split(" "),
    );
    const attrs = new Set(
      "xmlns viewBox width height d points x y cx cy r rx ry transform fill fill-rule fill-opacity opacity id".split(
        " ",
      ),
    );
    const nodes = [root, ...root.querySelectorAll("*")];
    if (nodes.length > 512)
      throw Error("Use a simpler outlined logo (512 elements maximum).");
    for (const el of nodes) {
      if (!tags.has(el.localName) || el.namespaceURI !== root.namespaceURI)
        throw Error(
          "Use filled SVG outlines without text, effects, or embedded images.",
        );
      for (const a of el.attributes) {
        if (!attrs.has(a.name) || /url\s*\(/i.test(a.value))
          throw Error(
            `Unsupported SVG attribute: ${a.name}. Try a transparent PNG.`,
          );
        if (a.name === "fill" && !/^(#[a-f\d]{3,8}|[a-z]+)$/i.test(a.value))
          throw Error("Use solid SVG fills or a transparent PNG.");
      }
    }
    const box = (root.getAttribute("viewBox") ?? "")
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (
      box.length !== 4 ||
      !box.every(Number.isFinite) ||
      box[2] <= 0 ||
      box[3] <= 0
    )
      throw Error("The SVG needs a valid viewBox.");
    const scale = 512 / Math.max(box[2], box[3]);
    root.setAttribute("width", String(Math.max(1, Math.round(box[2] * scale))));
    root.setAttribute(
      "height",
      String(Math.max(1, Math.round(box[3] * scale))),
    );
    blob = new Blob([new XMLSerializer().serializeToString(root)], {
      type: "image/svg+xml",
    });
  } else {
    const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (
      header.length < 24 ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => header[i] === b)
    )
      throw Error("Choose a transparent PNG or outlined SVG.");
    const v = new DataView(header.buffer);
    if (Math.max(v.getUint32(16), v.getUint32(20)) > 4096)
      throw Error("PNG dimensions must not exceed 4096 px.");
  }
  const url = URL.createObjectURL(blob),
    img = new Image();
  try {
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas"),
      k = Math.min(1, 512 / Math.max(img.width, img.height));
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width,
      y0 = c.height,
      x1 = -1,
      y1 = -1,
      transparent = false;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) {
        transparent = true;
        continue;
      }
      const x = (i / 4) % c.width,
        y = Math.floor(i / 4 / c.width);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    if (x1 < x0 || !transparent)
      throw Error("Use visible artwork on a transparent background.");
    const w = x1 - x0 + 1,
      h = y1 - y0 + 1,
      bytes = ctx.getImageData(x0, y0, w, h).data;
    let str = "";
    for (let i = 0; i < bytes.length; i += 8192)
      str += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { w, h, rgba: btoa(str) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function prepare(asset: Logo) {
  const { w, h } = asset,
    data = Uint8Array.from(atob(asset.rgba), (s) => s.charCodeAt(0)),
    alpha = new Array<number>(w * h),
    hist = new Map<string, number>();
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = data[i * 4 + 3];
    if (alpha[i] >= 128) {
      const key = color(Array.from(data.subarray(i * 4, i * 4 + 3)));
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
  }
  const fills = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  if (!fills.length) throw Error("Empty logo.");
  const palette = fills
    .filter((e) => e[1] >= fills[0][1] * 0.045)
    .slice(0, 6)
    .map((e) => e[0]);
  const dominant = palette[0],
    accent = palette.at(-1)!;
  // Protect all major fills, then favour legibility of the largest ink areas.
  const total = palette.reduce((sum, c) => sum + hist.get(c)!, 0);
  const score = (bg: string) =>
    Math.min(...palette.map((c) => contrast(c, bg))) +
    0.7 *
      palette.reduce(
        (sum, c) => sum + (Math.min(9, contrast(c, bg)) * hist.get(c)!) / total,
        0,
      );
  const background = [
    mix("#fffdf8", dominant, 0.035),
    mix("#23242a", dominant, 0.08),
    "#777777",
  ].sort((a, b) => score(b) - score(a))[0];
  const lamp = [
    mix("#ece6d8", accent, 0.28),
    mix("#373944", accent, 0.48),
  ].sort((a, b) => contrast(b, background) - contrast(a, background))[0];
  const polygons = contours().size([w, h]).contour(alpha, 127.5).coordinates;
  if (
    !polygons.length ||
    polygons.length > 64 ||
    polygons.flat().reduce((n, r) => n + r.length, 0) > 18000
  )
    throw Error("Too many disconnected pieces or edges. Use a simpler logo.");
  const scale = Math.min(2.8 / h, 8 / w),
    parts = polygons
      .map((rings) => {
        const loops = rings.map((r) =>
          r.map(
            ([x, y]) => new T.Vector2((x - w / 2) * scale, (h - y) * scale),
          ),
        );
        const shape = new T.Shape(loops[0]);
        shape.holes = loops.slice(1).map((r) => new T.Path(r));
        const b = new T.Box2().setFromPoints(loops[0]),
          top = b.max.y;
        // Pick a real summit. For a horizontal segment use its centre, not an end vertex.
        const candidates = loops[0]
          .filter((v) => Math.abs(v.y - top) < 1e-7)
          .map((v) => v.x);
        const mid = (b.min.x + b.max.x) / 2;
        let crown = candidates.reduce((a, x) =>
          Math.abs(x - mid) < Math.abs(a - mid) ? x : a,
        );
        for (let i = 1; i < loops[0].length; i++) {
          const a = loops[0][i - 1],
            v = loops[0][i];
          if (Math.abs(a.y - top) < 1e-7 && Math.abs(v.y - top) < 1e-7) {
            const x = T.MathUtils.clamp(
              mid,
              Math.min(a.x, v.x),
              Math.max(a.x, v.x),
            );
            if (Math.abs(x - mid) < Math.abs(crown - mid)) crown = x;
          }
        }
        return { shape, b, top, crown };
      })
      .sort((a, b) => a.b.min.x - b.b.min.x);
  return { w, h, data, scale, parts, lamp, background, dominant };
}
let last: Logo | undefined, prepared: ReturnType<typeof prepare>;
export function inspectLogo(asset: Logo) {
  if (last?.rgba !== asset.rgba || last.w !== asset.w || last.h !== asset.h) {
    prepared = prepare(asset);
    last = asset;
  }
  return prepared;
}

export function makeLogo(asset: Logo, index: number) {
  const { w, h, data, scale, parts, dominant } = inspectLogo(asset),
    part = parts[index];
  if (!part) throw Error("Choose a valid logo part.");
  const group = new T.Group(),
    texture = new T.DataTexture(data, w, h);
  texture.colorSpace = T.SRGBColorSpace;
  texture.magFilter = T.LinearFilter;
  texture.minFilter = T.LinearFilter;
  texture.needsUpdate = true;
  const face = new T.MeshBasicMaterial({ map: texture, alphaTest: 0.3 }),
    side = new T.MeshStandardMaterial({
      color: mix(dominant, "#222222", 0.23),
      roughness: 0.45,
    });
  const meshes = parts.map(({ shape }) => {
    const geo = new T.ExtrudeGeometry(shape, {
        depth: 0.22,
        bevelEnabled: false,
      }),
      pos = geo.getAttribute("position"),
      uv = geo.getAttribute("uv");
    for (let i = 0; i < pos.count; i++)
      uv.setXY(
        i,
        pos.getX(i) / (w * scale) + 0.5,
        1 - pos.getY(i) / (h * scale),
      );
    const m = new T.Mesh(geo, [face, side]);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  });
  const width = w * scale;
  return {
    group,
    selected: meshes[index],
    width,
    height: part.top,
    targetX: part.crown,
    baseline: 0,
    lampScale: Math.min(
      1.12,
      Math.max(0.64, (part.b.max.x - part.b.min.x) * 1.3),
    ),
    approachX: part.b.min.x - 0.8,
  };
}
