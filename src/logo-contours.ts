import { contours } from "d3-contour";

export function traceLogo(w: number, h: number, data: Uint8Array) {
  const alpha = Array.from({ length: w * h }, (_, i) => data[i * 4 + 3]);
  const polygons = contours().size([w, h]).contour(alpha, 127.5).coordinates;
  if (
    !polygons.length ||
    polygons.length > 64 ||
    polygons.flat().reduce((n, r) => n + r.length, 0) > 18000
  ) throw Error("Too many disconnected pieces or edges. Use a simpler logo.");

  const trace = polygons.flatMap((rings) => {
    const x0 = Math.max(0, Math.floor(Math.min(...rings[0].map(([x]) => x))));
    const y0 = Math.max(0, Math.floor(Math.min(...rings[0].map(([, y]) => y))));
    const width = Math.min(w, Math.ceil(Math.max(...rings[0].map(([x]) => x)))) - x0;
    const height = Math.min(h, Math.ceil(Math.max(...rings[0].map(([, y]) => y)))) - y0;
    const mask = new Uint8Array(width * height);
    const offset = (i: number) => ((y0 + Math.floor(i / width)) * w + x0 + i % width) * 4;
    const ink = new Map<number, { count: number; color: number[] }>();
    let total = 0;
    // Scan the silhouette, including its holes, without picking up a neighbouring glyph.
    for (let y = 0; y < height; y++) {
      const line = y0 + y + 0.5, crossings: number[] = [];
      for (const ring of rings)
        for (let j = 1; j < ring.length; j++) {
          const [ax, ay] = ring[j - 1], [bx, by] = ring[j];
          if ((ay > line) !== (by > line)) crossings.push(ax + (bx - ax) * (line - ay) / (by - ay));
        }
      crossings.sort((a, b) => a - b);
      for (let j = 0; j + 1 < crossings.length; j += 2)
        for (let x = Math.ceil(crossings[j] - x0 - 0.5); x < crossings[j + 1] - x0 - 0.5; x++) {
          const p = y * width + x, i = offset(p);
          if (data[i + 3] < 128) continue;
          mask[p] = 1;
          total++;
          const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
          const bin = ink.get(key);
          if (bin) bin.count++;
          else ink.set(key, { count: 1, color: Array.from(data.subarray(i, i + 3)) });
        }
    }
    const fallback = [{ rings, tint: [...ink.values()].sort((a, b) => b.count - a.count)[0]?.color }];
    if (ink.size < 2 || width < 8 || height < 5) return fallback;

    const regions: { pixels: number[]; left: number; right: number; top: number; bottom: number; tint: number[] }[] = [];
    for (let seed = 0; seed < mask.length; seed++) {
      if (!mask[seed]) continue;
      mask[seed] = 0;
      const base = offset(seed), pixels = [seed];
      let left = width, right = 0, top = height, bottom = 0;
      for (let j = 0; j < pixels.length; j++) {
        const p = pixels[j], x = p % width, y = Math.floor(p / width);
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
        for (const q of [x ? p - 1 : -1, x < width - 1 ? p + 1 : -1, p - width, p + width]) {
          if (!mask[q]) continue;
          const i = offset(q);
          if ([0, 1, 2].some((c) => Math.abs(data[i + c] - data[base + c]) > 54)) continue;
          mask[q] = 0;
          pixels.push(q);
        }
      }
      if (pixels.length >= Math.max(8, total * 0.08)) {
        const i = offset(pixels[Math.floor(pixels.length / 2)]);
        regions.push({ pixels, left, right, top, bottom, tint: Array.from(data.subarray(i, i + 3)) });
      }
    }
    regions.sort((a, b) => a.left + a.right - b.left - b.right);
    // A colour boundary alone is not a letter boundary. Split only substantial,
    // side-by-side regions, not stacked or nested fills within a monogram.
    if (regions.length < 2 || regions.reduce((n, r) => n + r.pixels.length, 0) < total * 0.91)
      return fallback;
    for (const [i, r] of regions.entries()) {
      if (r.bottom - r.top + 1 < height * 0.52) return fallback;
      const prev = regions[i - 1];
      if (!prev) continue;
      const overlapX = Math.min(prev.right, r.right) - Math.max(prev.left, r.left) + 1;
      const overlapY = Math.min(prev.bottom, r.bottom) - Math.max(prev.top, r.top) + 1;
      if (overlapX > 0.34 * Math.min(prev.right - prev.left + 1, r.right - r.left + 1) ||
          overlapY < 0.5 * Math.min(prev.bottom - prev.top + 1, r.bottom - r.top + 1)) return fallback;
    }
    const split = regions.map(({ pixels, tint }) => {
      const ink = new Array<number>(mask.length).fill(0);
      for (const p of pixels) ink[p] = 255;
      const polygons = contours().size([width, height]).contour(ink, 127.5).coordinates;
      return { polygons, tint };
    });
    if (split.some(({ polygons }) => polygons.length !== 1)) return fallback;
    return split.map(({ polygons, tint }) => ({
      rings: polygons[0].map((r) => r.map(([x, y]) => [x + x0, y + y0])), tint,
    }));
  });
  if (trace.length > 64 || trace.flatMap((p) => p.rings).reduce((n, r) => n + r.length, 0) > 18000)
    throw Error("Too many disconnected pieces or edges. Use a simpler logo.");
  return trace;
}
