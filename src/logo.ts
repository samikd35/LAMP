import * as T from "three";
import { traceLogo } from "./logo-contours";
import { logoCurveSegments, readLogoSvg, vectorLogo } from "./logo-svg";
import { logoRasterLimit } from "./config.mjs";
import { titleGap } from "./text";

type RasterLogo = { w: number; h: number; rgba: string };
export type Logo = RasterLogo | { svg: string };
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

function removeSolidBackground(data: Uint8ClampedArray, w: number, h: number) {
  const border: number[] = [];
  for (let x = 0; x < w; x++) {
    border.push(x * 4);
    if (h > 1) border.push(((h - 1) * w + x) * 4);
  }
  for (let y = 1; y < h - 1; y++) {
    border.push(y * w * 4);
    if (w > 1) border.push((y * w + w - 1) * 4);
  }
  const [r, g, b] = [0, 1, 2].map((channel) =>
    border.map((i) => data[i + channel]).sort((a, b) => a - b)[
      border.length >> 1
    ],
  );
  const distance = (i: number) =>
    Math.max(
      Math.abs(data[i] - r),
      Math.abs(data[i + 1] - g),
      Math.abs(data[i + 2] - b),
    );
  if (border.filter((i) => distance(i) <= 12).length < border.length * 0.95)
    throw Error(
      "Couldn't find a solid background. Leave plain space around the logo, or use a transparent PNG.",
    );
  const strengths = Uint8Array.from({ length: w * h }, (_, p) => distance(p * 4));
  const source = data.slice(), matte = [r, g, b];
  for (let p = 0; p < strengths.length; p++) {
    const i = p * 4, strength = strengths[p];
    // Remove matching pixels inside the logo too, so enclosed holes stay open.
    if (strength <= 24) {
      data[i + 3] = 0;
      continue;
    }
    const x = p % w, y = Math.floor(p / w);
    if (![x ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w].some((q) => strengths[q] <= 24)) continue;
    // Undo background colour in antialiased edge pixels using nearby solid ink.
    let ink = -1, strongest = strength * 1.15;
    for (let sy = Math.max(0, y - 2); sy <= Math.min(h - 1, y + 2); sy++)
      for (let sx = Math.max(0, x - 2); sx <= Math.min(w - 1, x + 2); sx++) {
        const q = sy * w + sx, s = strengths[q], j = q * 4;
        if (s > strongest && matte.every((bg, c) =>
          Math.abs(source[i + c] - bg - (source[j + c] - bg) * strength / s) <= 12,
        )) {
          strongest = s;
          ink = j;
        }
      }
    if (ink < 0) continue;
    data.set(source.subarray(ink, ink + 3), i);
    data[i + 3] = Math.round(255 * strength / strongest);
  }
}

export async function importLogo(file: File): Promise<{ asset: Logo; backgroundRemoved: boolean }> {
  if (file.size > 2 * 1024 * 1024)
    throw Error("Choose an SVG, PNG, or JPEG up to 2 MB.");
  let blob: Blob = file;
  if (/\.svg$/i.test(file.name)) {
    const source = await file.text();
    const svg = readLogoSvg(source);
    if (vectorLogo(source, svg)) return { asset: { svg: source }, backgroundRemoved: false };
    const { root, w, h } = svg, scale = logoRasterLimit / Math.max(w, h);
    root.setAttribute("width", String(Math.max(1, Math.round(w * scale))));
    root.setAttribute("height", String(Math.max(1, Math.round(h * scale))));
    blob = new Blob([new XMLSerializer().serializeToString(root)], {
      type: "image/svg+xml",
    });
  } else {
    const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
    if (
      header.length === 24 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => header[i] === b)
    ) {
      const v = new DataView(header.buffer);
      if (Math.max(v.getUint32(16), v.getUint32(20)) > 4096)
        throw Error("Image dimensions must not exceed 4096 px.");
      blob = file.slice(0, file.size, "image/png");
    } else if ([255, 216, 255].every((b, i) => header[i] === b)) {
      blob = file.slice(0, file.size, "image/jpeg");
    } else {
      throw Error("Choose a PNG, JPEG, or outlined SVG.");
    }
  }
  const url = URL.createObjectURL(blob),
    img = new Image();
  try {
    img.src = url;
    await img.decode().catch(() => {
      throw Error(
        "Couldn't open this image. Try another PNG, JPEG, or outlined SVG.",
      );
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (longest > 4096)
      throw Error("Image dimensions must not exceed 4096 px.");
    const c = document.createElement("canvas"),
      k = Math.min(1, logoRasterLimit / longest);
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const backgroundRemoved = !data.some((v, i) => i % 4 === 3 && v < 128);
    if (backgroundRemoved) removeSolidBackground(data, c.width, c.height);
    let x0 = c.width,
      y0 = c.height,
      x1 = -1,
      y1 = -1;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const x = (i / 4) % c.width,
        y = Math.floor(i / 4 / c.width);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    if (x1 < x0)
      throw Error(
        "No visible logo found. Try artwork that contrasts with its background.",
      );
    const w = x1 - x0 + 1,
      h = y1 - y0 + 1;
    let str = "";
    for (let y = y0; y <= y1; y++) {
      const start = (y * c.width + x0) * 4;
      str += String.fromCharCode(...data.subarray(start, start + w * 4));
    }
    return { asset: { w, h, rgba: btoa(str) }, backgroundRemoved };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function suggestColors(hist: Map<string, number>) {
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
  return { lamp, background, dominant };
}

function measurePart(layers: { shape: T.Shape; points: T.Vector2[]; tint: string; order: number }[]) {
  const b = new T.Box2().setFromPoints(layers.flatMap((layer) => layer.points));
  const mid = (b.min.x + b.max.x) / 2;
  let crown = Infinity;
  // Pick a real summit. On a flat top, use the point nearest the part's centre.
  for (const { points } of layers) for (let i = 0; i < points.length; i++) {
    const p = points[i], next = points[(i + 1) % points.length];
    if (Math.abs(p.y - b.max.y) >= 1e-7) continue;
    const x = Math.abs(next.y - b.max.y) < 1e-7
      ? T.MathUtils.clamp(mid, Math.min(p.x, next.x), Math.max(p.x, next.x)) : p.x;
    if (Math.abs(x - mid) < Math.abs(crown - mid)) crown = x;
  }
  return { b, crown, layers };
}

function prepareRaster({ w, h, rgba }: RasterLogo) {
  const bin = atob(rgba), data = new Uint8Array(bin.length), hist = new Map<string, number>();
  for (let i = 0; i < data.length; i++) data[i] = bin.charCodeAt(i);
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] >= 128) {
    const key = color(Array.from(data.subarray(i, i + 3)));
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  const colors = suggestColors(hist), scale = Math.min(2.8 / h, 8 / w);
  const parts = traceLogo(w, h, data).map(({ rings, tint }) => {
    const loops = rings.map((ring) => {
      let points = ring.slice(0, -1);
      // Relax pixel stair steps without resampling tiny holes into solids.
      if (points.length >= 12) for (let pass = 0; pass < 2; pass++)
        points = points.map(([x, y], i, r) => {
          const a = r[(i + r.length - 1) % r.length], b = r[(i + 1) % r.length];
          return [(a[0] + 6 * x + b[0]) / 8, (a[1] + 6 * y + b[1]) / 8];
        });
      return [...points, points[0]].map(
        ([x, y]) => new T.Vector2((x - w / 2) * scale, (h - y) * scale),
      );
    });
    const shape = new T.Shape(loops[0]);
    shape.holes = loops.slice(1).map((r) => new T.Path(r));
    return measurePart([{ shape, points: loops[0], tint: tint ? color(tint) : colors.dominant, order: 0 }]);
  });
  // Extend ink RGB into fully transparent neighbours. Linear texture sampling
  // then blends with artwork instead of the old matte or hidden black pixels.
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (data[i + 3] !== 0) continue;
    const x = p % w, y = Math.floor(p / w);
    let best = i;
    for (let dy = Math.max(0, y - 1); dy <= Math.min(h - 1, y + 1); dy++)
      for (let dx = Math.max(0, x - 1); dx <= Math.min(w - 1, x + 1); dx++) {
        const j = (dy * w + dx) * 4;
        if (data[j + 3] > data[best + 3]) best = j;
      }
    if (best !== i) data.set(data.subarray(best, best + 3), i);
  }
  return { parts, colors, w, h, scale, data };
}

function prepare(asset: Logo) {
  const vector = "svg" in asset ? vectorLogo(asset.svg) : null;
  if ("svg" in asset && !vector) throw Error("This SVG requires a new raster import.");
  const raster = "rgba" in asset ? prepareRaster(asset) : null;
  let parts, colors;
  if (vector) {
    const hist = new Map<string, number>();
    for (const group of vector.groups) for (const { b, tint } of group) {
      const size = b.getSize(new T.Vector2());
      hist.set(tint, (hist.get(tint) ?? 0) + size.x * size.y);
    }
    colors = suggestColors(hist);
    parts = vector.groups.map(measurePart);
  } else {
    ({ parts, colors } = raster!);
  }
  parts.sort((a, b) => a.b.min.x + a.b.max.x - b.b.min.x - b.b.max.x);
  const source = new T.Box2();
  for (const part of parts) source.union(part.b);
  const gap = titleGap(parts.length);
  let width = 0;
  const placed = parts.map((part, i) => {
    const x = width - part.b.min.x;
    width += part.b.max.x - part.b.min.x + (i < parts.length - 1 ? gap : 0);
    return { ...part, x };
  }).map((part) => ({ ...part, x: part.x - width / 2, crown: part.crown + part.x - width / 2 }));
  return { raster, vector, parts: placed, source, width, ...colors };
}
let last: Logo | undefined, prepared: ReturnType<typeof prepare>;
export function inspectLogo(asset: Logo) {
  const same = last && ("svg" in asset
    ? "svg" in last && last.svg === asset.svg
    : "rgba" in last && last.rgba === asset.rgba && last.w === asset.w && last.h === asset.h);
  if (!same) {
    prepared = prepare(asset);
    last = asset;
  }
  return prepared;
}

export function makeLogo(asset: Logo, index: number) {
  const { raster, vector, parts, source, width } = inspectLogo(asset),
    part = parts[index];
  if (!part) throw Error("Choose a valid logo part.");
  const group = new T.Group();
  let rasterFace: T.MeshBasicMaterial | undefined;
  if (raster) {
    const texture = new T.DataTexture(raster.data, raster.w, raster.h);
    texture.colorSpace = T.SRGBColorSpace;
    texture.magFilter = T.LinearFilter;
    texture.minFilter = T.LinearFilter;
    texture.needsUpdate = true;
    rasterFace = new T.MeshBasicMaterial({ map: texture, alphaTest: 0.3 });
  }
  const meshes = parts.map(({ layers, b, x }) => {
    const piece = new T.Group();
    piece.position.x = x;
    for (const { shape, tint, order } of layers) {
      const face = rasterFace ?? new T.MeshBasicMaterial({ color: tint });
      const side = new T.MeshStandardMaterial({ color: mix(tint, "#222222", 0.23), roughness: 0.45 });
      const geo = new T.ExtrudeGeometry(shape, {
        depth: 0.35, bevelEnabled: false, curveSegments: vector ? logoCurveSegments : 1,
      }).translate(0, 0, -0.35);
      const mesh = new T.Mesh(geo, [face, side]);
      if (vector) {
        const { scale, origin } = vector;
        mesh.scale.set(scale, -scale, 1);
        mesh.position.set(-origin.min.x * scale, origin.max.y * scale - b.min.y, order * 0.00015);
      } else if (raster) {
        const { w, h, scale } = raster, pos = geo.getAttribute("position"), uv = geo.getAttribute("uv");
        for (let i = 0; i < pos.count; i++)
          uv.setXY(i, pos.getX(i) / (w * scale) + 0.5, 1 - pos.getY(i) / (h * scale));
        geo.translate(0, -b.min.y, 0);
      }
      mesh.castShadow = mesh.receiveShadow = true;
      piece.add(mesh);
    }
    group.add(piece);
    return piece;
  });
  const left = part.x + part.b.min.x,
    neighbor = parts[index - 1],
    sourceCenter = source.getCenter(new T.Vector2()),
    first = parts[0].b;
  return {
    group,
    selected: meshes[index],
    width,
    sourceSize: source.getSize(new T.Vector2()),
    firstWidth: first.max.x - first.min.x,
    height: part.b.max.y - part.b.min.y,
    targetX: part.crown,
    behind: !!neighbor,
    approachX: neighbor ? (left + neighbor.x + neighbor.b.max.x) / 2 : left - 1.82,
    layout(amount: number) {
      meshes.forEach((mesh, i) => {
        const { x, b } = parts[i];
        mesh.position.x = T.MathUtils.lerp(-sourceCenter.x, x, amount);
        mesh.position.y = (b.min.y - source.min.y) * (1 - amount);
      });
    },
  };
}
