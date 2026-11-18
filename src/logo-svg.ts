import * as T from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { logoSvgLimit } from "./config.mjs";

const tags = new Set("svg g path rect circle ellipse polygon polyline title desc".split(" "));
const attrs = new Set(
  "xmlns viewBox width height d points x y cx cy r rx ry transform fill fill-rule fill-opacity opacity id".split(" "),
);
export const logoCurveSegments = 40;

export function readLogoSvg(source: string) {
  if (source.length > logoSvgLimit || /<!doctype|<!entity|<\?xml-stylesheet/i.test(source))
    throw Error("Please supply a simple outlined SVG.");
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = doc.documentElement;
  if (root.localName !== "svg" || root.namespaceURI !== "http://www.w3.org/2000/svg" || doc.querySelector("parsererror"))
    throw Error("Invalid SVG document.");
  const nodes = [root, ...root.querySelectorAll("*")];
  if (nodes.length > 512) throw Error("Use a simpler outlined logo (512 elements maximum).");
  for (const el of nodes) {
    if (!tags.has(el.localName) || el.namespaceURI !== root.namespaceURI)
      throw Error("Use filled SVG outlines without text, effects, or embedded images.");
    for (const a of el.attributes) {
      if (!attrs.has(a.name) || /url\s*\(/i.test(a.value))
        throw Error(`Unsupported SVG attribute: ${a.name}. Try a transparent PNG.`);
      if (a.name === "fill" && !/^(#[a-f\d]{3,8}|[a-z]+)$/i.test(a.value))
        throw Error("Use solid SVG fills or a transparent PNG.");
    }
  }
  const [x, y, w, h, ...extra] = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (extra.length || ![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0)
    throw Error("The SVG needs a valid viewBox.");
  return { root, nodes, box: new T.Box2(new T.Vector2(x, y), new T.Vector2(x + w, y + h)), w, h };
}

export function vectorLogo(source: string, svg = readLogoSvg(source)) {
  // The loader builds fills, not an SVG compositor. Keep clipping, nested
  // viewports, opacity and full-page background removal on the raster path.
  if (svg.nodes.some((node) => {
    const fill = node.getAttribute("fill");
    return node.tagName !== node.localName || (node !== svg.root && node.localName === "svg") ||
      ["opacity", "fill-opacity"].some((attr) => node.hasAttribute(attr) && !/^(?:1(?:\.0+)?|100%)$/.test(node.getAttribute(attr)!.trim())) ||
      (fill !== null && (fill.startsWith("#")
        ? fill.length !== 4 && fill.length !== 7
        : fill !== "none" && !Object.hasOwn(T.Color.NAMES, fill.toLowerCase())));
  })) return null;

  const { paths } = new SVGLoader().parse(source);
  let curveCount = 0;
  for (const path of paths)
    for (const subPath of path.subPaths)
      curveCount += subPath.curves.length;
  if (curveCount > 4000) throw Error("Too many SVG curves. Simplify the artwork or try a transparent PNG.");

  const layers = [], bounds = new T.Box2(), eps = Math.max(svg.w, svg.h) * 1e-6;
  let pointCount = 0;
  for (const path of paths) {
    if (path.userData?.style.fill?.toLowerCase() === "none") continue;
    for (const shape of SVGLoader.createShapes(path)) {
      const points = shape.getPoints(logoCurveSegments), box = new T.Box2().setFromPoints(points);
      const size = box.getSize(new T.Vector2());
      pointCount += points.length + shape.holes.reduce((sum, hole) => sum + hole.getPoints(logoCurveSegments).length, 0);
      if (pointCount > 24000 || layers.length >= 128)
        throw Error("Too many SVG edges or layers. Simplify the artwork or try a transparent PNG.");
      if (![box.min.x, box.min.y, box.max.x, box.max.y].every(Number.isFinite) || size.x <= 0 || size.y <= 0) continue;
      if (box.min.x < svg.box.min.x - eps || box.min.y < svg.box.min.y - eps ||
          box.max.x > svg.box.max.x + eps || box.max.y > svg.box.max.y + eps) return null;
      if (path.userData?.node.localName === "rect" && shape.holes.length === 0 &&
          box.min.distanceTo(svg.box.min) <= eps && box.max.distanceTo(svg.box.max) <= eps) return null;
      bounds.union(box);
      layers.push({ shape, points, tint: `#${path.color.getHexString()}`, order: layers.length });
    }
  }
  if (!layers.length) throw Error("No visible logo found. Use filled SVG outlines.");
  const size = bounds.getSize(new T.Vector2());
  const scale = Math.min(2.8 / size.y, 8 / size.x);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  // Map SVG coordinates to the stage before layout, while retaining the curves
  // themselves for extrusion. Offsetting here also handles nonzero viewBoxes.
  const groups: (typeof layers[number] & { b: T.Box2 })[][] = [];
  for (const layer of layers) {
    const points = layer.points.map(({ x, y }) => new T.Vector2((x - bounds.min.x) * scale, (bounds.max.y - y) * scale));
    const b = new T.Box2().setFromPoints(points);
    const group = [{ ...layer, b, points }];
    for (let i = groups.length - 1; i >= 0; i--) {
      if (!groups[i].some(({ b: other }) => {
        const overlapX = Math.min(b.max.x, other.max.x) - Math.max(b.min.x, other.min.x);
        const gapY = Math.max(b.min.y, other.min.y) - Math.min(b.max.y, other.max.y);
        return overlapX > 0.6 * Math.min(b.max.x - b.min.x, other.max.x - other.min.x) &&
          gapY < 0.25 * Math.max(b.max.y - b.min.y, other.max.y - other.min.y);
      })) continue;
      group.push(...groups.splice(i, 1)[0]);
    }
    groups.push(group);
  }
  if (groups.length > 64) throw Error("Too many disconnected pieces. Use a simpler logo.");
  return { groups, scale, origin: bounds };
}
