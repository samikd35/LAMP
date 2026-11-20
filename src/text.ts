import * as T from "three";
import { Font, type FontData } from "three/addons/loaders/FontLoader.js";
import data from "./assets/outlines.json";
import { analyze } from "./config.mjs";
const font = new Font(data as unknown as FontData);
const kern: Record<string, number> = data.kern,
  glyphs: Record<string, { ha: number }> = data.glyphs;
export const titleGap = (count: number) => Math.max(0.28, 1.43 - (count - 5) * 0.063);
export function makeText(name: string, target: number, color: string) {
  const group = new T.Group(),
    chars = analyze(name).chars,
    size = 1.24,
    unit = size / data.resolution;
  const material = new T.MeshPhysicalMaterial({
    color,
    roughness: 0.52,
    specularIntensity: 0.18,
    metalness: 0.04,
  });
  let cursor = 0,
    selected!: T.Mesh;
  chars.forEach((ch, i) => {
    if (i) cursor += (kern[chars[i - 1] + ch] ?? 0) * unit;
    if (ch !== " ") {
      const shapes = font.generateShapes(ch, size);
      const geometry = new T.ExtrudeGeometry(shapes, {
        depth: 0.16,
        bevelThickness: 0.004,
        bevelSize: 0.004,
        bevelSegments: 2,
        curveSegments: 8,
      });
      // Each letter is a freestanding casting. A descending J or y must not
      // lift the neighboring castings; punctuation retains its font elevation.
      const isLetter = /^\p{L}/u.test(ch);
      if (isLetter) {
        geometry.computeBoundingBox();
        geometry.translate(0, -geometry.boundingBox!.min.y, 0);
      }
      const mesh = new T.Mesh(geometry, material);
      if (isLetter) mesh.userData.letterIndex = i;
      mesh.position.x = cursor;
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      if (i === target) selected = mesh;
    }
    cursor += glyphs[ch].ha * unit + titleGap(chars.length);
  });
  const bounds = new T.Box3().setFromObject(group),
    center = (bounds.min.x + bounds.max.x) / 2;
  group.position.set(-center, -bounds.min.y, 0);
  const pos = selected.geometry.getAttribute("position");
  selected.geometry.computeBoundingBox();
  const b = selected.geometry.boundingBox!,
    mid = (b.min.x + b.max.x) / 2;
  // Choose a real crown under the foot, not the air between the two tops of M.
  let crown = b.min.x;
  for (let i = 0; i < pos.count; i++)
    if (
      pos.getY(i) > b.max.y - 0.012 &&
      Math.abs(pos.getX(i) - mid) < Math.abs(crown - mid)
    )
      crown = pos.getX(i);
  const contact = selected.position.x + crown;
  let clearance = Infinity,
    leftNeighbor = -Infinity;
  for (const m of group.children as T.Mesh[]) {
    if (m === selected) continue;
    m.geometry.computeBoundingBox();
    const adjacent = m.geometry.boundingBox!;
    if (m.position.x < selected.position.x)
      leftNeighbor = Math.max(leftNeighbor, m.position.x + adjacent.max.x);
    clearance = Math.min(
      clearance,
      Math.max(
        adjacent.min.x + m.position.x - contact,
        contact - adjacent.max.x - m.position.x,
      ),
    );
  }
  // Scale the whole rig, never its base alone. Narrow or tightly kerned crowns
  // use a smaller foot, while a lone I can support an overhanging weighted base.
  const lampScale = Math.min(
    1.14,
    Math.max(0.61, (clearance - 0.012) / 0.36),
    0.77 + Math.min(0.37, (b.max.x - b.min.x) * 0.52),
  );
  return {
    group,
    selected,
    lampScale,
    width: bounds.max.x - bounds.min.x,
    baseline: group.position.y,
    height: b.max.y,
    targetX: contact - center,
    approachX: Number.isFinite(leftNeighbor)
      ? (leftNeighbor + selected.position.x + b.min.x) / 2 - center
      : selected.position.x + b.min.x - center - 0.85,
  };
}
